import { NextRequest, NextResponse } from 'next/server';
import { initFirebaseAdmin } from '@/lib/firebaseAdmin';
import * as admin from 'firebase-admin';
import { notifyAdminOfBillsPurchase } from '@/lib/bills-admin-alerts';
import { resolveActorUserIdFromRequest, verifyExternalBillsPayment } from '@/lib/bills-payment';

interface UsufElectricityResponse {
  status: boolean;
  message: string;
  data?: Record<string, unknown>;
}

const USUF_API_URL = 'https://www.usufdataservice.com/api/billpayment/';

function toVendorMeterType(value: unknown) {
  return Number(value) === 2 ? 2 : 1
}

function getMeterTypeCandidates(value: unknown) {
  const isPostpaid = Number(value) === 2 || String(value || '').trim().toLowerCase() === 'postpaid'
  const base = isPostpaid
    ? [2, '2', 'POSTPAID', 'postpaid']
    : [1, '1', 'PREPAID', 'prepaid']

  return Array.from(new Set(base))
}

export async function POST(request: NextRequest): Promise<NextResponse<UsufElectricityResponse>> {
  try {
    const authToken = process.env.USUF_AUTH_TOKEN;

    if (!authToken) {
      return NextResponse.json(
        { status: false, message: 'Usuf API not configured' },
        { status: 500 }
      );
    }

    const body = await request.json();
    const { disco_name, amount, meter_number: rawMeter, MeterType, payFromWallet, sellAmount, paymentReference, provider } = body;
    let meter_number = rawMeter;

    // stricter check: allow zero amounts if vendor permits, only undefined causes failure
    if (disco_name === undefined || amount === undefined || !meter_number || MeterType === undefined) {
      return NextResponse.json(
        { status: false, message: 'Missing required fields' },
        { status: 400 }
      );
    }

    // normalize types to numbers / trimmed strings before sending downstream
    const discoN = Number(disco_name);
    const amountVendor = Number(amount);
    const meterTypeValue = toVendorMeterType(MeterType);
    const meterTypeCandidates = getMeterTypeCandidates(MeterType);
    meter_number = String(meter_number).trim();

    let verifiedUid: string | null = (await resolveActorUserIdFromRequest(request)) || null;
    let userType: 'advertiser' | 'earner' | null = null;
    let txDocRef: admin.firestore.DocumentReference | null = null;
    let db: admin.firestore.Firestore | null = null;
    let adminAuth: admin.auth.Auth | null = null;
    const amountN = Number(sellAmount || amount || 0);

    if (payFromWallet && amountN > 0) {
      const authHeader = request.headers.get('authorization') || request.headers.get('Authorization');
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return NextResponse.json({ status: false, message: 'Missing Authorization token' }, { status: 401 });
      }
      const idToken = authHeader.split('Bearer ')[1];

      const adminInit = await initFirebaseAdmin();
      adminAuth = adminInit.admin?.auth() || null;
      db = adminInit.dbAdmin as admin.firestore.Firestore;

      if (!adminAuth || !db) {
        return NextResponse.json({ status: false, message: 'Server admin unavailable' }, { status: 500 });
      }

      try {
        const decoded = await adminAuth.verifyIdToken(idToken);
        verifiedUid = decoded.uid;
      } catch (err) {
        console.error('Invalid ID token', err);
        return NextResponse.json({ status: false, message: 'Invalid ID token' }, { status: 401 });
      }

      const advertiserRef = db!.collection('advertisers').doc(verifiedUid);
      const earnerRef = db!.collection('earners').doc(verifiedUid);
      const advSnap = await advertiserRef.get();
      const earSnap = await earnerRef.get();

      let userRef: admin.firestore.DocumentReference;
      if (advSnap.exists) {
        userType = 'advertiser';
        userRef = advertiserRef;
      } else if (earSnap.exists) {
        userType = 'earner';
        userRef = earnerRef;
      } else {
        return NextResponse.json({ status: false, message: 'User wallet not found' }, { status: 404 });
      }

      if (userType === 'earner' && !earSnap.data()?.activated) {
        return NextResponse.json(
          {
            status: false,
            message: 'Your first N2,000 earned will be used to activate your account automatically before wallet spending is allowed.',
          },
          { status: 400 }
        );
      }

      const txCollection = userType === 'advertiser' ? 'advertiserTransactions' : 'earnerTransactions';
      txDocRef = db!.collection(txCollection).doc();

      try {
        await db!.runTransaction(async (t: admin.firestore.Transaction) => {
          const uSnap = await t.get(userRef);
          const userData = uSnap.data() as Record<string, unknown> | undefined;
          const bal = Number(userData?.balance || 0);
          if (bal < amountN) throw new Error('Insufficient balance');

          t.update(userRef, { balance: admin.firestore.FieldValue.increment(-amountN) });
          t.set(txDocRef!, {
            userId: verifiedUid,
            type: 'usuf_electricity',
            amount: -amountN,
            status: 'pending',
            disco: disco_name,
            meter: meter_number || null,
            meterType: MeterType,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
          });
        });
      } catch (e: unknown) {
        const msg = (e instanceof Error && e.message) || 'Insufficient funds';
        const status = msg.includes('Insufficient') ? 402 : 500;
        return NextResponse.json({ status: false, message: msg }, { status });
      }
    }

    if (!payFromWallet) {
      try {
        await verifyExternalBillsPayment({
          provider,
          reference: paymentReference,
          expectedAmount: amountN,
        });
      } catch (error) {
        console.error('Direct electricity payment verification failed', error);
        return NextResponse.json({ status: false, message: error instanceof Error ? error.message : 'Payment verification failed' }, { status: 400 });
      }
    }

    const sendVendorRequest = async (candidateMeterType: string | number) => {
      const payload = {
        disco_name: discoN,
        amount: amountVendor,
        meter_number,
        MeterType: candidateMeterType,
      }

      const abortController = new AbortController()
      const timeoutId = setTimeout(() => abortController.abort(), 30000)

      try {
        const response = await fetch(USUF_API_URL, {
          method: 'POST',
          headers: {
            'Authorization': `Token ${authToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
          signal: abortController.signal,
        })

        const text = await response.text()
        let data: Record<string, unknown> = {}
        try {
          data = text ? JSON.parse(text) as Record<string, unknown> : {}
        } catch {
          data = { raw: text }
        }

        return { response, data, requestBody: JSON.stringify(payload), meterType: candidateMeterType }
      } finally {
        clearTimeout(timeoutId)
      }
    }

    const attempt = await sendVendorRequest(meterTypeValue)
    let response = attempt.response
    let data = attempt.data
    let debugRequestBody = attempt.requestBody

    if (data?.MeterType && Array.isArray(data.MeterType)) {
      for (const candidate of meterTypeCandidates) {
        if (candidate === attempt.meterType) continue
        const retryAttempt = await sendVendorRequest(candidate)
        response = retryAttempt.response
        data = retryAttempt.data
        debugRequestBody = retryAttempt.requestBody
        if (!(data?.MeterType && Array.isArray(data.MeterType))) {
          break
        }
      }
    }

    console.log('Usuf Electricity API Response:', {
  status: response.status,
  statusText: response.statusText,
  data,
  requestBody: debugRequestBody,
});

    const vendorSuccess = Boolean(response.ok) || String(data?.Status || data?.status || '').toLowerCase() === 'successful' || String(data?.status || '').toLowerCase() === 'success';

    if (!vendorSuccess) {
      if (payFromWallet && amountN > 0 && txDocRef && db && adminAuth && verifiedUid && userType) {
        try {
          const userRefRollback = userType === 'advertiser'
            ? db!.collection('advertisers').doc(verifiedUid)
            : db!.collection('earners').doc(verifiedUid);
          await db!.runTransaction(async (t: admin.firestore.Transaction) => {
            t.update(userRefRollback, { balance: admin.firestore.FieldValue.increment(amountN) });
            t.update(txDocRef!, { status: 'failed', response: data, updatedAt: new Date().toISOString() });
          });
        } catch (e) {
          console.error('Failed to rollback wallet', e);
        }
      }

      if (data?.error) {
        console.error('Usuf API error:', Array.isArray(data.error) ? data.error[0] : data.error);
      }

      return NextResponse.json(
        {
          status: false,
          message: 'Please wait for some time and try to purchase again',
          apiResponse: data,
        },
        { status: typeof response.status === 'number' ? response.status : 500 }
      );
    }

    const responseData = data as Record<string, unknown>
    const returnData = ((responseData.data as Record<string, unknown> | undefined) ?? responseData) as Record<string, unknown>
    const message =
      String(
        responseData.message ||
        responseData.api_response ||
        responseData.apiResponse ||
        returnData.api_response ||
        returnData.api_response_message ||
        'Electricity payment successful'
      )

    const completeWithRetry = async (ref: import('firebase-admin').firestore.DocumentReference, data: Record<string, unknown>) => {
      try {
        await ref.update(data);
      } catch (err) {
        console.warn('Failed to update transaction, retrying in 5s', err);
        setTimeout(() => {
          ref.update(data).catch((e) => console.error('Retry failed:', e));
        }, 5000);
      }
    };

    if (payFromWallet && amountN > 0 && txDocRef && db && adminAuth) {
      await completeWithRetry(txDocRef!, { 
        status: 'completed', 
        response: returnData, 
        updatedAt: new Date().toISOString() 
      });
    }

    // Compensation: if user elected to pay from wallet but for some reason the
    // initial transaction wasn't created/debited, create a completed transaction
    // now and decrement the user's balance to keep records consistent.
    if (payFromWallet && amountN > 0 && db && adminAuth && verifiedUid && userType) {
      try {
        if (!txDocRef) {
          const txCollection = userType === 'advertiser' ? 'advertiserTransactions' : 'earnerTransactions';
          const userRef = userType === 'advertiser' ? db.collection('advertisers').doc(verifiedUid) : db.collection('earners').doc(verifiedUid);
          const newTxRef = db.collection(txCollection).doc();
          await db.runTransaction(async (t: admin.firestore.Transaction) => {
            const uSnap = await t.get(userRef);
            const bal = Number(uSnap.data()?.balance || 0);
            if (bal < amountN) throw new Error('Insufficient balance for post-debit');
            t.update(userRef, { balance: admin.firestore.FieldValue.increment(-amountN) });
            t.set(newTxRef, {
              userId: verifiedUid,
              type: 'usuf_electricity',
              amount: -amountN,
              status: 'completed',
              disco: disco_name,
              meter: meter_number || null,
              meterType: MeterType,
              response: returnData,
              createdAt: admin.firestore.FieldValue.serverTimestamp(),
              updatedAt: new Date().toISOString(),
            });
          });
        }
      } catch (e) {
        console.error('Post-success wallet debit failed for electricity purchase', e);
      }
    }

    await notifyAdminOfBillsPurchase({
      actorUserId: verifiedUid || undefined,
      paidAmount: amountN,
      serviceID: 'electricity',
      paymentChannel: payFromWallet ? 'wallet' : String(provider || 'direct'),
      reference: String(paymentReference || returnData?.reference || returnData?.id || ''),
    });

    return NextResponse.json({
      status: true,
      message,
      data: returnData,
    });
  } catch (error) {
    console.error('Usuf Electricity API error:', error);
    
    // Handle timeout errors specifically
    if (error instanceof Error && error.name === 'AbortError') {
      return NextResponse.json(
        { status: false, message: 'Request timeout - Usuf service took too long to respond. Please try again.' },
        { status: 504 }
      );
    }
    
    // Handle network errors
    const errorMsg = error instanceof Error ? error.message : 'Network error';
    if (errorMsg.includes('fetch failed') || errorMsg.includes('ConnectTimeoutError')) {
      return NextResponse.json(
        { status: false, message: 'Network error - Unable to connect to Usuf service. Please try again.' },
        { status: 503 }
      );
    }

    return NextResponse.json(
      { status: false, message: errorMsg },
      { status: 500 }
    );
  }
}

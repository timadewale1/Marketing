import { NextRequest, NextResponse } from 'next/server';
import { initFirebaseAdmin } from '@/lib/firebaseAdmin';
import * as admin from 'firebase-admin';

interface UsufAirtimeRequest {
  network: number;
  amount: number;
  mobile_number: string;
  Ported_number: boolean;
  airtime_type: string;
}

interface UsufAirtimeResponse {
  status: boolean;
  message: string;
  data?: Record<string, unknown>;
}

const USUF_API_URL = 'https://www.usufdataservice.com/api/topup/';

export async function POST(request: NextRequest): Promise<NextResponse<UsufAirtimeResponse>> {
  try {
    const authToken = process.env.USUF_AUTH_TOKEN;

    if (!authToken) {
      return NextResponse.json(
        { status: false, message: 'Usuf API not configured' },
        { status: 500 }
      );
    }

    const body = await request.json();
    const { network, amount, mobile_number, Ported_number, payFromWallet, sellAmount } = body;

    if (!network || !amount || !mobile_number) {
      return NextResponse.json(
        { status: false, message: 'Missing required fields' },
        { status: 400 }
      );
    }

    let verifiedUid: string | null = null;
    let userType: 'advertiser' | 'earner' | null = null;
    let txDocRef: admin.firestore.DocumentReference | null = null;
    let db: admin.firestore.Firestore | null = null;
    let adminAuth: admin.auth.Auth | null = null;
    const amountN = Number(sellAmount || 0);

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
            type: 'usuf_airtime',
            amount: -amountN,
            status: 'pending',
            network,
            phone: mobile_number || null,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
          });
        });
      } catch (e: unknown) {
        const msg = (e instanceof Error && e.message) || 'Insufficient funds';
        const status = msg.includes('Insufficient') ? 402 : 500;
        return NextResponse.json({ status: false, message: msg }, { status });
      }
    }

    const payload: UsufAirtimeRequest = {
      network,
      amount,
      mobile_number,
      Ported_number: Ported_number ?? true,
      airtime_type: 'VTU',
    };

    // Create abort controller with 30 second timeout
    const abortController = new AbortController();
    const timeoutId = setTimeout(() => abortController.abort(), 30000);

    let response;
    try {
      response = await fetch(USUF_API_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Token ${authToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
        signal: abortController.signal,
      });
    } finally {
      clearTimeout(timeoutId);
    }

    const data = await response.json();

    console.log('Usuf Airtime API Response:', {
      status: response.status,
      statusText: response.statusText,
      data,
      payload,
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

      // Extract error message - handle both string and array formats
      const errorMessage = 'Please wait for some time and try to purchase again';
      if (data?.error) {
        console.error('Usuf API error:', Array.isArray(data.error) ? data.error[0] : data.error);
      }

      return NextResponse.json(
        {
          status: false,
          message: errorMessage,
          apiResponse: data,
        },
        { status: typeof response.status === 'number' ? response.status : 500 }
      );
    }

    const returnData = data?.data ?? data;
    const message = data?.message || data?.api_response || data?.apiResponse || (returnData && (returnData.api_response || returnData.api_response_message)) || 'Airtime purchase successful';

    if (payFromWallet && amountN > 0 && txDocRef && db && adminAuth) {
      try {
        await txDocRef!.update({ 
          status: 'completed', 
          response: returnData, 
          updatedAt: new Date().toISOString() 
        });
      } catch (e) {
        console.warn('Failed to update transaction after successful Usuf airtime purchase', e);
      }
    }

    return NextResponse.json({
      status: true,
      message,
      data: returnData,
    });
  } catch (error) {
    console.error('Usuf Airtime API error:', error);
    
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

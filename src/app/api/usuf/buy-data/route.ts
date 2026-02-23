import { NextRequest, NextResponse } from 'next/server';
import type { UsufNetwork } from '@/services/usufPlans';
import { initFirebaseAdmin } from '@/lib/firebaseAdmin';
import * as admin from 'firebase-admin';

export interface UsufBuyDataRequest {
  network: UsufNetwork;
  mobile_number: string;
  plan: number;
  Ported_number: boolean;
}

export interface UsufBuyDataResponse {
  status: boolean;
  message: string;
  data?: Record<string, unknown>;
}

const USUF_API_URL = 'https://www.usufdataservice.com/api/data/';

export async function POST(request: NextRequest): Promise<NextResponse<UsufBuyDataResponse>> {
  try {
    const authToken = process.env.USUF_AUTH_TOKEN;

    if (!authToken) {
      return NextResponse.json(
        {
          status: false,
          message: 'Usuf API not configured',
        },
        { status: 500 }
      );
    }

    const body = await request.json();
    const { network, mobile_number, plan, Ported_number, payFromWallet, sellAmount } = body;

    // Validate required fields
    if (!network || !mobile_number || !plan) {
      return NextResponse.json(
        {
          status: false,
          message: 'Missing required fields',
        },
        { status: 400 }
      );
    }

    // Handle wallet payment: verify user, check balance, and reserve funds
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

      let userRef: import('firebase-admin').firestore.DocumentReference;
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
        await db!.runTransaction(async (t: import('firebase-admin').firestore.Transaction) => {
          const uSnap = await t.get(userRef);
          const userData = uSnap.data() as Record<string, unknown> | undefined;
          const bal = Number(userData?.balance || 0);
          if (bal < amountN) throw new Error('Insufficient balance');

          t.update(userRef, { balance: admin.firestore.FieldValue.increment(-amountN) });
          t.set(txDocRef!, {
            userId: verifiedUid,
            type: 'usuf_purchase',
            amount: -amountN,
            status: 'pending',
            network,
            plan,
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

    const payload: UsufBuyDataRequest = {
      network,
      mobile_number,
      plan,
      Ported_number: Ported_number ?? true,
    };

    const response = await fetch(USUF_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Token ${authToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json();

    console.log('Usuf API Response:', {
      status: response.status,
      statusText: response.statusText,
      data,
      payload,
    });

    // Determine success: accept HTTP OK/Created or vendor-specific success flag
    const vendorSuccess = Boolean(response.ok) || String(data?.Status || data?.status || '').toLowerCase() === 'successful' || String(data?.status || '').toLowerCase() === 'success';

    if (!vendorSuccess) {
      // If wallet was used, restore the balance and mark transaction as failed
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

      return NextResponse.json(
        {
          status: false,
          message: data?.message || data?.error || `API returned ${response.status}`,
          apiResponse: data,
        },
        { status: typeof response.status === 'number' ? response.status : 500 }
      );
    }

    // Normalize returned payload for client consumption
    const returnData = data?.data ?? data;
    const message = data?.message || data?.api_response || data?.apiResponse || (returnData && (returnData.api_response || returnData.api_response_message)) || 'Data purchase successful';

    // If wallet was used, update transaction to completed
    if (payFromWallet && amountN > 0 && txDocRef && db && adminAuth) {
      try {
        await txDocRef!.update({ 
          status: 'completed', 
          response: returnData, 
          updatedAt: new Date().toISOString() 
        });
      } catch (e) {
        console.warn('Failed to update transaction after successful Usuf purchase', e);
      }
    }

    return NextResponse.json({
      status: true,
      message,
      data: returnData,
    });
  } catch (error) {
    console.error('Usuf API error:', error);
    return NextResponse.json(
      {
        status: false,
        message: error instanceof Error ? error.message : 'Network error',
      },
      { status: 500 }
    );
  }
}

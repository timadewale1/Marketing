// // Test script to verify activation and wallet funding functionality
// import { processActivationWithRetry, processWalletFundingWithRetry } from '../src/lib/paymentProcessing'
// import { initFirebaseAdmin } from '../src/lib/firebaseAdmin'

// async function testActivationAndFunding() {
//   console.log('🧪 Testing Activation and Wallet Funding Functionality')

//   try {
//     const { admin, dbAdmin } = await initFirebaseAdmin()
//     if (!dbAdmin || !admin) {
//       console.error('❌ Firebase admin not initialized')
//       return
//     }

//     const adminDb = dbAdmin as import('firebase-admin').firestore.Firestore

//     // Test data
//     const testUserId = 'test-user-' + Date.now()
//     const testReference = 'test-ref-' + Date.now()

//     console.log('📝 Test User ID:', testUserId)
//     console.log('🔗 Test Reference:', testReference)

//     // Create test user in advertisers collection
//     await adminDb.collection('advertisers').doc(testUserId).set({
//       name: 'Test Advertiser',
//       email: 'test@example.com',
//       balance: 0,
//       activated: false,
//       createdAt: admin.firestore.FieldValue.serverTimestamp(),
//     })

//     console.log('✅ Test advertiser created')

//     // Test 1: Activation
//     console.log('\n🔄 Testing Activation...')
//     const activationResult = await processActivationWithRetry(testUserId, testReference, 'monnify')

//     if (activationResult && activationResult.success) {
//       console.log('✅ Activation successful')

//       // Verify user was activated
//       const userDoc = await adminDb.collection('advertisers').doc(testUserId).get()
//       const userData = userDoc.data()

//       if (userData?.activated) {
//         console.log('✅ User activation status confirmed')
//       } else {
//         console.log('❌ User activation status not set')
//       }

//       // Verify transaction was created
//       const txSnap = await adminDb.collection('advertiserTransactions')
//         .where('userId', '==', testUserId)
//         .where('type', '==', 'activation_fee')
//         .where('reference', '==', testReference)
//         .limit(1)
//         .get()

//       if (!txSnap.empty) {
//         console.log('✅ Activation transaction created')
//         const txData = txSnap.docs[0].data()
//         console.log('💰 Transaction amount:', txData.amount)
//         console.log('📊 Transaction status:', txData.status)
//       } else {
//         console.log('❌ Activation transaction not found')
//       }

//     } else {
//       console.log('❌ Activation failed:', activationResult)
//     }

//     // Test 2: Wallet Funding
//     console.log('\n💰 Testing Wallet Funding...')
//     const fundingResult = await processWalletFundingWithRetry(testUserId, testReference + '-fund', 5000, 'monnify', 'advertiser')

//     if (fundingResult && fundingResult.success) {
//       console.log('✅ Wallet funding successful')

//       // Verify balance was updated
//       const updatedUserDoc = await adminDb.collection('advertisers').doc(testUserId).get()
//       const updatedUserData = updatedUserDoc.data()

//       if (updatedUserData?.balance === 5000) {
//         console.log('✅ Balance updated correctly')
//       } else {
//         console.log('❌ Balance not updated correctly. Expected: 5000, Got:', updatedUserData?.balance)
//       }

//       // Verify funding transaction was created
//       const fundTxSnap = await adminDb.collection('advertiserTransactions')
//         .where('userId', '==', testUserId)
//         .where('type', '==', 'wallet_funding')
//         .where('reference', '==', testReference + '-fund')
//         .limit(1)
//         .get()

//       if (!fundTxSnap.empty) {
//         console.log('✅ Funding transaction created')
//         const fundTxData = fundTxSnap.docs[0].data()
//         console.log('💰 Funding amount:', fundTxData.amount)
//         console.log('📊 Funding status:', fundTxData.status)
//       } else {
//         console.log('❌ Funding transaction not found')
//       }

//     } else {
//       console.log('❌ Wallet funding failed:', fundingResult)
//     }

//     // Test 3: Duplicate processing (should be idempotent)
//     console.log('\n🔄 Testing Idempotency...')

//     const duplicateActivation = await processActivationWithRetry(testUserId, testReference, 'monnify')
//     if (duplicateActivation && duplicateActivation.alreadyActivated) {
//       console.log('✅ Duplicate activation handled correctly (already activated)')
//     } else {
//       console.log('❌ Duplicate activation not handled correctly')
//     }

//     const duplicateFunding = await processWalletFundingWithRetry(testUserId, testReference + '-fund', 5000, 'monnify', 'advertiser')
//     if (duplicateFunding && duplicateFunding.alreadyProcessed) {
//       console.log('✅ Duplicate funding handled correctly (already processed)')
//     } else {
//       console.log('❌ Duplicate funding not handled correctly')
//     }

//     // Cleanup
//     console.log('\n🧹 Cleaning up test data...')
//     await adminDb.collection('advertisers').doc(testUserId).delete()

//     // Delete transactions
//     const allTxs = await adminDb.collection('advertiserTransactions')
//       .where('userId', '==', testUserId)
//       .get()

//     for (const doc of allTxs.docs) {
//       await doc.ref.delete()
//     }

//     console.log('✅ Test data cleaned up')
//     console.log('\n🎉 All tests completed!')

//   } catch (error) {
//     console.error('❌ Test failed:', error)
//   }
// }

// // Run the test
// testActivationAndFunding().catch(console.error)
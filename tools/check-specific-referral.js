"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
var admin = __importStar(require("firebase-admin"));
var fs = __importStar(require("fs"));
var path = __importStar(require("path"));
function main() {
    return __awaiter(this, void 0, void 0, function () {
        var serviceAccountKey, keyPath, envKey, dbAdmin, referrerEmail, referredEmail_1, earnerReferrerSnap, advertiserReferrerSnap, referrerId_1, referrerCollection_1, earnerReferredSnap, advertiserReferredSnap, referredId_1, referredUserCollection, data, data, referralsSnap, referralDoc_1, referralData, txCollection, txRef_1, bonus_1, err_1;
        var _this = this;
        var _a, _b, _c;
        return __generator(this, function (_d) {
            switch (_d.label) {
                case 0:
                    try {
                        keyPath = path.join(__dirname, '../serviceAccountKey.json');
                        serviceAccountKey = JSON.parse(fs.readFileSync(keyPath, 'utf8'));
                    }
                    catch (_e) {
                        envKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
                        if (!envKey) {
                            console.error('❌ No Firebase credentials found');
                            process.exit(1);
                        }
                        serviceAccountKey = JSON.parse(envKey);
                    }
                    admin.initializeApp({
                        credential: admin.credential.cert(serviceAccountKey),
                    });
                    dbAdmin = admin.firestore();
                    _d.label = 1;
                case 1:
                    _d.trys.push([1, 9, , 10]);
                    console.log('🔍 Searching for referral...\n');
                    referrerEmail = 'idowualalade49@gmail.com';
                    referredEmail_1 = 'angeloreoluwa999@gmail.com';
                    console.log("\uD83D\uDCE7 Referrer: ".concat(referrerEmail));
                    console.log("\uD83D\uDCE7 Referred: ".concat(referredEmail_1, "\n"));
                    return [4 /*yield*/, dbAdmin
                            .collection('earners')
                            .where('email', '==', referrerEmail)
                            .get()
                        // Search advertisers collection for referrer
                    ];
                case 2:
                    earnerReferrerSnap = _d.sent();
                    return [4 /*yield*/, dbAdmin
                            .collection('advertisers')
                            .where('email', '==', referrerEmail)
                            .get()];
                case 3:
                    advertiserReferrerSnap = _d.sent();
                    referrerId_1 = null;
                    referrerCollection_1 = null;
                    if (earnerReferrerSnap.size > 0) {
                        referrerId_1 = earnerReferrerSnap.docs[0].id;
                        referrerCollection_1 = 'earners';
                        console.log("\u2705 Found referrer in earners collection: ".concat(referrerId_1));
                    }
                    else if (advertiserReferrerSnap.size > 0) {
                        referrerId_1 = advertiserReferrerSnap.docs[0].id;
                        referrerCollection_1 = 'advertisers';
                        console.log("\u2705 Found referrer in advertisers collection: ".concat(referrerId_1));
                    }
                    else {
                        console.log("\u274C Referrer not found in earners or advertisers");
                        process.exit(1);
                    }
                    return [4 /*yield*/, dbAdmin
                            .collection('earners')
                            .where('email', '==', referredEmail_1)
                            .get()];
                case 4:
                    earnerReferredSnap = _d.sent();
                    return [4 /*yield*/, dbAdmin
                            .collection('advertisers')
                            .where('email', '==', referredEmail_1)
                            .get()];
                case 5:
                    advertiserReferredSnap = _d.sent();
                    referredId_1 = null;
                    referredUserCollection = null;
                    if (earnerReferredSnap.size > 0) {
                        referredId_1 = earnerReferredSnap.docs[0].id;
                        referredUserCollection = 'earners';
                        data = earnerReferredSnap.docs[0].data();
                        console.log("\u2705 Found referred user in earners collection: ".concat(referredId_1));
                        console.log("   Activated: ".concat(data.activated || false));
                    }
                    else if (advertiserReferredSnap.size > 0) {
                        referredId_1 = advertiserReferredSnap.docs[0].id;
                        referredUserCollection = 'advertisers';
                        data = advertiserReferredSnap.docs[0].data();
                        console.log("\u2705 Found referred user in advertisers collection: ".concat(referredId_1));
                        console.log("   Activated: ".concat(data.activated || false));
                    }
                    else {
                        console.log("\u274C Referred user not found");
                        process.exit(1);
                    }
                    // Find referral record
                    console.log("\n\uD83D\uDD0E Searching for referral record...\n");
                    return [4 /*yield*/, dbAdmin
                            .collection('referrals')
                            .where('referrerId', '==', referrerId_1)
                            .where('referredId', '==', referredId_1)
                            .get()];
                case 6:
                    referralsSnap = _d.sent();
                    if (referralsSnap.size === 0) {
                        console.log("\u274C No referral record found between these users");
                        process.exit(1);
                    }
                    referralDoc_1 = referralsSnap.docs[0];
                    referralData = referralDoc_1.data();
                    console.log("\u2705 Found referral record: ".concat(referralDoc_1.id));
                    console.log("   Status: ".concat(referralData.status));
                    console.log("   Bonus Paid: ".concat(referralData.bonusPaid));
                    console.log("   Bonus Amount: \u20A6".concat(((_a = referralData.bonus) === null || _a === void 0 ? void 0 : _a.toLocaleString()) || 0));
                    console.log("   Created: ".concat(((_c = (_b = referralData.createdAt) === null || _b === void 0 ? void 0 : _b.toDate) === null || _c === void 0 ? void 0 : _c.call(_b)) || 'N/A'));
                    if (referralData.bonusPaid === true) {
                        console.log("\n\u2705 Bonus has already been paid!");
                        process.exit(0);
                    }
                    if (!(referralData.bonus && referralData.bonus > 0)) return [3 /*break*/, 8];
                    console.log("\n\uD83D\uDCB0 Processing bonus payment...\n");
                    txCollection = referrerCollection_1 === 'advertisers' ? 'advertiserTransactions' : 'earnerTransactions';
                    txRef_1 = dbAdmin.collection(txCollection).doc();
                    bonus_1 = referralData.bonus;
                    return [4 /*yield*/, dbAdmin.runTransaction(function (transaction) { return __awaiter(_this, void 0, void 0, function () {
                            var referrerRef, referralRef;
                            return __generator(this, function (_a) {
                                // Create transaction record
                                transaction.set(txRef_1, {
                                    userId: referrerId_1,
                                    type: 'referral_bonus',
                                    amount: bonus_1,
                                    status: 'completed',
                                    note: "Referral bonus for referring ".concat(referredEmail_1),
                                    referralId: referralDoc_1.id,
                                    referredId: referredId_1,
                                    createdAt: admin.firestore.FieldValue.serverTimestamp(),
                                });
                                referrerRef = dbAdmin.collection(referrerCollection_1).doc(referrerId_1);
                                transaction.update(referrerRef, {
                                    balance: admin.firestore.FieldValue.increment(bonus_1),
                                });
                                referralRef = dbAdmin.collection('referrals').doc(referralDoc_1.id);
                                transaction.update(referralRef, {
                                    status: 'completed',
                                    bonusPaid: true,
                                    paidAt: admin.firestore.FieldValue.serverTimestamp(),
                                    paidAmount: bonus_1,
                                    completedAt: admin.firestore.FieldValue.serverTimestamp(),
                                });
                                return [2 /*return*/];
                            });
                        }); })];
                case 7:
                    _d.sent();
                    console.log("\u2705 Bonus successfully credited!");
                    console.log("   Amount: \u20A6".concat(bonus_1.toLocaleString()));
                    console.log("   Credited to: ".concat(referrerCollection_1, " (").concat(referrerId_1, ")"));
                    console.log("   Transaction ID: ".concat(txRef_1.id));
                    _d.label = 8;
                case 8: return [3 /*break*/, 10];
                case 9:
                    err_1 = _d.sent();
                    console.error('❌ Error:', err_1);
                    process.exit(1);
                    return [3 /*break*/, 10];
                case 10: return [2 /*return*/];
            }
        });
    });
}
main().catch(function (e) {
    console.error(e);
    process.exit(1);
});

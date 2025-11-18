import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface WithdrawDialogProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (amount: number) => Promise<void>;
  maxAmount: number;
  bankDetails: {
    accountNumber: string;
    bankName: string;
    accountName: string;
  } | null;
}

export function WithdrawDialog({ open, onClose, onSubmit, maxAmount, bankDetails }: WithdrawDialogProps) {
  const [amount, setAmount] = useState<number | "">("");
  const [submitting, setSubmitting] = useState(false);
  const minWithdraw = 2000;

  const handleSubmit = async () => {
    if (!amount || Number(amount) < minWithdraw) {
      return;
    }
    if (Number(amount) > maxAmount) {
      return;
    }

    setSubmitting(true);
    try {
      await onSubmit(Number(amount));
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  const fee = typeof amount === 'number' && amount > 0 ? Math.round(Number(amount) * 0.1) : 0
  const net = typeof amount === 'number' && amount > 0 ? Math.max(0, Number(amount) - fee) : 0

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="sm:max-w-[425px] bg-white p-6">
        <DialogHeader>
          <DialogTitle className="text-xl font-semibold text-primary-800">Withdraw Funds</DialogTitle>
          <DialogDescription className="text-primary-600">
            Enter amount to withdraw to your bank account.
          </DialogDescription>
        </DialogHeader>

        <div className="mt-6 space-y-4">
          {bankDetails ? (
            <div className="p-4 bg-primary-50 rounded-lg border border-primary-100">
              <div className="text-sm text-primary-600">Bank Account</div>
              <div className="font-medium text-primary-800">{bankDetails.accountName}</div>
              <div className="text-sm text-primary-600">{bankDetails.bankName} • {bankDetails.accountNumber}</div>
            </div>
          ) : (
            <div className="text-center p-4 bg-gold-50 text-gold-700 rounded-lg">
              Please add your bank details in your profile first.
            </div>
          )}

          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-primary-600">Available balance</span>
              <span className="font-medium text-primary-800">₦{maxAmount.toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-primary-600">Minimum withdrawal</span>
              <span className="font-medium text-primary-800">₦{minWithdraw.toLocaleString()}</span>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-primary-700">Amount to withdraw</label>
            <Input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value === "" ? "" : Number(e.target.value))}
              placeholder="Enter amount"
              min={minWithdraw}
              max={maxAmount}
              className="text-lg"
            />
          </div>

          {amount && (
            <>
              {Number(amount) < minWithdraw && (
                <p className="text-sm text-red-600">
                  Minimum withdrawal amount is ₦{minWithdraw.toLocaleString()}
                </p>
              )}
              {Number(amount) > maxAmount && (
                <p className="text-sm text-red-600">
                  Amount exceeds your available balance
                </p>
              )}
              {/* Fee preview */}
              <div className="mt-2 p-3 bg-stone-50 rounded-lg">
                <div className="flex justify-between text-sm text-stone-700">
                  <span>Service fee (10%)</span>
                  <span>₦{fee.toLocaleString()}</span>
                </div>
                <div className="flex justify-between font-medium mt-1">
                  <span>Net amount to receive</span>
                  <span>₦{net.toLocaleString()}</span>
                </div>
              </div>
            </>
          )}

          <div className="flex gap-3 mt-6">
            <Button
              onClick={handleSubmit}
              disabled={
                submitting || 
                !amount || 
                Number(amount) < minWithdraw || 
                Number(amount) > maxAmount ||
                !bankDetails
              }
              className="flex-1 bg-gold-500 hover:bg-gold-600 text-primary-900 font-medium"
            >
              {submitting ? "Processing..." : "Withdraw"}
            </Button>
            <Button
              variant="outline"
              onClick={onClose}
              className="hover:bg-primary-100"
            >
              Cancel
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
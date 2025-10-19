import React from "react"

export type PaystackModalProps = {
  amount: number
  email: string
  onSuccess: (reference: string) => void
  onClose: () => void
  open: boolean
}

export const PaystackModal: React.FC<PaystackModalProps> = ({ amount, email, onSuccess, onClose, open }) => {
  React.useEffect(() => {
    if (!open) return

    // Load Paystack script
    const loadScript = async () => {
      // If script already exists and we have PaystackPop, proceed
      // @ts-expect-error PaystackPop is not typed
      if (document.getElementById("paystack-script") && window.PaystackPop) {
        handlePay()
        return
      }

      // Create and load the script
      return new Promise<void>((resolve) => {
        const script = document.createElement("script")
        script.id = "paystack-script"
        script.src = "https://js.paystack.co/v1/inline.js"
        script.async = true
        script.onload = () => {
          handlePay()
          resolve()
        }
        document.body.appendChild(script)
      })
    }

    loadScript()
  }, [open])

  const handlePay = React.useCallback(() => {
    // PaystackPop type definition
    interface PaystackPopInterface {
      setup: (config: {
        key: string;
        email: string;
        amount: number;
        currency: string;
        callback: (response: { reference: string }) => void;
        onClose: () => void;
      }) => {
        openIframe: () => void;
      };
    }

    // Get Paystack instance
    // @ts-expect-error PaystackPop is not typed
    const PaystackPop = window.PaystackPop as PaystackPopInterface | undefined;

    if (!PaystackPop) {
      console.error('Paystack not loaded')
      return
    }

    const handler = PaystackPop.setup({
      key: process.env.NEXT_PUBLIC_PAYSTACK_KEY || '',
      email,
      amount: amount * 100, // Paystack expects kobo
      currency: "NGN",
      callback: function (response: { reference: string }) {
        onSuccess(response.reference)
      },
      onClose,
    })

    // Open payment modal
    handler.openIframe()
  }, [amount, email, onSuccess, onClose])

  React.useEffect(() => {
    if (!open) return

    // Load Paystack script
    const loadScript = async () => {
      // If script already exists and we have PaystackPop, proceed
      // @ts-expect-error PaystackPop is not typed
      if (document.getElementById("paystack-script") && window.PaystackPop) {
        handlePay()
        return
      }

      // Create and load the script
      return new Promise<void>((resolve) => {
        const script = document.createElement("script")
        script.id = "paystack-script"
        script.src = "https://js.paystack.co/v1/inline.js"
        script.async = true
        script.onload = () => {
          handlePay()
          resolve()
        }
        document.body.appendChild(script)
      })
    }

    loadScript()
  }, [open, handlePay])

  return null // Modal is handled by Paystack iframe
}

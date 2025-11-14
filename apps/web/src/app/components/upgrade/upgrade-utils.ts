/**
 * Handles the upgrade action - redirects to Stripe Checkout
 */
export async function handleUpgrade(): Promise<void> {
    try {
        // Call the checkout API to create a Stripe Checkout session
        const response = await fetch("/api/checkout", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || "Failed to create checkout session");
        }

        const data = await response.json();
        
        // Redirect to Stripe Checkout
        if (data.url) {
            window.location.href = data.url;
        } else {
            throw new Error("No checkout URL returned");
        }
    } catch (error: unknown) {
        console.error("Error initiating checkout:", error);
        const message = error instanceof Error ? error.message : "Failed to start checkout. Please try again.";
        alert(`Error: ${message}`);
    }
}


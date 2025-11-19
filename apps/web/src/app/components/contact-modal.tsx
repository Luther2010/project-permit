"use client";

import { useState, FormEvent } from "react";
import { useSession } from "next-auth/react";
import { Modal } from "./base-modal";
import { graphqlFetch } from "@/lib/graphql-client";

interface ContactModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export function ContactModal({ isOpen, onClose }: ContactModalProps) {
    const { data: session } = useSession();
    const [formData, setFormData] = useState({
        name: "",
        message: "",
    });
    const [manualEmail, setManualEmail] = useState("");
    const [status, setStatus] = useState<{
        type: "idle" | "loading" | "success" | "error";
        message: string | null;
    }>({
        type: "idle",
        message: null,
    });

    // Derive email: use session email if logged in, otherwise use manual input
    const sessionEmail = session?.user?.email || "";
    const isEmailDisabled = !!session?.user?.email;
    const email = isEmailDisabled ? sessionEmail : manualEmail;

    const handleChange = (
        e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
    ) => {
        const { name, value } = e.target;
        if (name === "email") {
            setManualEmail(value);
        } else {
            setFormData((prev) => ({ ...prev, [name]: value }));
        }
    };

    const validateForm = (): string | null => {
        if (!formData.name.trim()) {
            return "Name is required.";
        }
        if (formData.name.length > 100) {
            return "Name is too long (max 100 characters).";
        }
        if (!email.trim()) {
            return "Email is required.";
        }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            return "Invalid email format.";
        }
        if (email.length > 254) {
            return "Email is too long (max 254 characters).";
        }
        if (!formData.message.trim()) {
            return "Message is required.";
        }
        if (formData.message.length < 10) {
            return "Message is too short (min 10 characters).";
        }
        if (formData.message.length > 5000) {
            return "Message is too long (max 5000 characters).";
        }
        return null;
    };

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        const validationError = validateForm();
        if (validationError) {
            setStatus({ type: "error", message: validationError });
            return;
        }

        setStatus({ type: "loading", message: "Sending message..." });

        try {
            const data = await graphqlFetch(
                `
                mutation SubmitContactForm($name: String!, $email: String!, $message: String!) {
                    submitContactForm(name: $name, email: $email, message: $message) {
                        message
                    }
                }
                `,
                {
                    name: formData.name,
                    email,
                    message: formData.message,
                }
            );

            setStatus({
                type: "success",
                message:
                    data.submitContactForm?.message ||
                    "Thank you for contacting us! We'll get back to you soon.",
            });
            setFormData({ name: "", message: "" });
            setManualEmail("");

            // Close modal after 2 seconds on success
            setTimeout(() => {
                onClose();
                setStatus({ type: "idle", message: null });
            }, 2000);
        } catch (error) {
            console.error("Contact form submission error:", error);
            const errorMessage =
                error instanceof Error
                    ? error.message
                    : "An unexpected error occurred. Please try again later.";
            setStatus({
                type: "error",
                message: errorMessage,
            });
        }
    };

    const handleClose = () => {
        onClose();
        // Reset form when closing
        setFormData({ name: "", message: "" });
        setManualEmail("");
        setStatus({ type: "idle", message: null });
    };

    return (
        <Modal isOpen={isOpen} onClose={handleClose} title="Contact Us">
            <div className="space-y-6">
                <p className="text-sm text-gray-600">
                    We&apos;d love to hear from you!
                </p>

                {status.type === "success" ? (
                    <div className="rounded-md bg-green-50 p-4">
                        <div className="flex">
                            <div className="flex-shrink-0">
                                <svg
                                    className="h-5 w-5 text-green-400"
                                    viewBox="0 0 20 20"
                                    fill="currentColor"
                                    aria-hidden="true"
                                >
                                    <path
                                        fillRule="evenodd"
                                        d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.06l2.5 2.5a.75.75 0 001.137-.089l4.003-5.5z"
                                        clipRule="evenodd"
                                    />
                                </svg>
                            </div>
                            <div className="ml-3">
                                <h3 className="text-sm font-medium text-green-800">
                                    Success!
                                </h3>
                                <div className="mt-2 text-sm text-green-700">
                                    <p>{status.message}</p>
                                </div>
                            </div>
                        </div>
                    </div>
                ) : (
                    <form className="space-y-4" onSubmit={handleSubmit}>
                        {status.type === "error" && (
                            <div className="rounded-md bg-red-50 p-4">
                                <div className="flex">
                                    <div className="flex-shrink-0">
                                        <svg
                                            className="h-5 w-5 text-red-400"
                                            viewBox="0 0 20 20"
                                            fill="currentColor"
                                            aria-hidden="true"
                                        >
                                            <path
                                                fillRule="evenodd"
                                                d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94l-1.72-1.72z"
                                                clipRule="evenodd"
                                            />
                                        </svg>
                                    </div>
                                    <div className="ml-3">
                                        <h3 className="text-sm font-medium text-red-800">
                                            Error
                                        </h3>
                                        <div className="mt-2 text-sm text-red-700">
                                            <p>{status.message}</p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        <div>
                            <label htmlFor="name" className="sr-only">
                                Name
                            </label>
                            <input
                                id="name"
                                name="name"
                                type="text"
                                autoComplete="name"
                                required
                                className="relative block w-full appearance-none rounded-md border border-gray-300 px-3 py-2 text-gray-900 placeholder-gray-500 focus:z-10 focus:border-blue-500 focus:outline-none focus:ring-blue-500 sm:text-sm"
                                placeholder="Your Name"
                                value={formData.name}
                                onChange={handleChange}
                                maxLength={100}
                            />
                            <div className="text-xs text-gray-500 text-right mt-1">
                                {formData.name.length}/100
                            </div>
                        </div>

                        <div>
                            <label htmlFor="email-address" className="sr-only">
                                Email address
                            </label>
                            <input
                                id="email-address"
                                name="email"
                                type="email"
                                autoComplete="email"
                                required
                                disabled={isEmailDisabled}
                                className={`relative block w-full appearance-none rounded-md border border-gray-300 px-3 py-2 text-gray-900 placeholder-gray-500 focus:z-10 focus:border-blue-500 focus:outline-none focus:ring-blue-500 sm:text-sm ${
                                    isEmailDisabled
                                        ? "bg-gray-100 cursor-not-allowed"
                                        : "bg-white"
                                }`}
                                placeholder="Email address"
                                value={email}
                                onChange={handleChange}
                                maxLength={254}
                            />
                            {isEmailDisabled && (
                                <p className="mt-1 text-xs text-gray-500">
                                    Using your account email
                                </p>
                            )}
                        </div>

                        <div>
                            <label htmlFor="message" className="sr-only">
                                Message
                            </label>
                            <textarea
                                id="message"
                                name="message"
                                rows={5}
                                required
                                className="relative block w-full appearance-none rounded-md border border-gray-300 px-3 py-2 text-gray-900 placeholder-gray-500 focus:z-10 focus:border-blue-500 focus:outline-none focus:ring-blue-500 sm:text-sm"
                                placeholder="Your message"
                                value={formData.message}
                                onChange={handleChange}
                                minLength={10}
                                maxLength={5000}
                            />
                            <div className="text-xs text-gray-500 text-right mt-1">
                                {formData.message.length}/5000
                            </div>
                        </div>

                        <button
                            type="submit"
                            disabled={status.type === "loading"}
                            className="group relative flex w-full justify-center rounded-md border border-transparent bg-blue-600 py-2 px-4 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {status.type === "loading" ? "Sending..." : "Send Message"}
                        </button>
                    </form>
                )}

                <div className="pt-4 border-t border-gray-200">
                    <p className="text-xs text-gray-600 text-center">
                        We&apos;re a nimble team and can get back to you within a short timeframe. For urgent matters,
                        please include &quot;URGENT&quot; in your message.
                    </p>
                </div>
            </div>
        </Modal>
    );
}


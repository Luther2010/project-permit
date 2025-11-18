"use client";

import { useState, FormEvent } from "react";
import Link from "next/link";

export default function ContactPage() {
    const [formData, setFormData] = useState({
        name: "",
        email: "",
        message: "",
    });
    const [status, setStatus] = useState<{
        type: "idle" | "loading" | "success" | "error";
        message: string | null;
    }>({
        type: "idle",
        message: null,
    });

    const handleChange = (
        e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
    ) => {
        const { name, value } = e.target;
        setFormData((prev) => ({ ...prev, [name]: value }));
    };

    const validateForm = (): string | null => {
        if (!formData.name.trim()) {
            return "Name is required.";
        }
        if (formData.name.length > 100) {
            return "Name is too long (max 100 characters).";
        }
        if (!formData.email.trim()) {
            return "Email is required.";
        }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
            return "Invalid email format.";
        }
        if (formData.email.length > 254) {
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
        
        // TODO: Implement API endpoint in next PR
        // For now, just simulate a delay and show success
        setTimeout(() => {
            setStatus({
                type: "success",
                message: "Thank you for contacting us! We'll get back to you soon.",
            });
            setFormData({ name: "", email: "", message: "" });
        }, 1000);
    };

    return (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
            <div className="max-w-md w-full space-y-8">
                <div>
                    <h2 className="mt-6 text-center text-3xl font-bold tracking-tight text-gray-900">
                        Contact Us
                    </h2>
                    <p className="mt-2 text-center text-sm text-gray-600">
                        We&apos;d love to hear from you!
                    </p>
                </div>

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
                    <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
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

                        <div className="rounded-md shadow-sm -space-y-px">
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
                                    className="relative block w-full appearance-none rounded-none rounded-t-md border border-gray-300 px-3 py-2 text-gray-900 placeholder-gray-500 focus:z-10 focus:border-blue-500 focus:outline-none focus:ring-blue-500 sm:text-sm"
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
                                    className="relative block w-full appearance-none rounded-none border border-gray-300 px-3 py-2 text-gray-900 placeholder-gray-500 focus:z-10 focus:border-blue-500 focus:outline-none focus:ring-blue-500 sm:text-sm"
                                    placeholder="Email address"
                                    value={formData.email}
                                    onChange={handleChange}
                                    maxLength={254}
                                />
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
                                    className="relative block w-full appearance-none rounded-none rounded-b-md border border-gray-300 px-3 py-2 text-gray-900 placeholder-gray-500 focus:z-10 focus:border-blue-500 focus:outline-none focus:ring-blue-500 sm:text-sm"
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

                <div className="mt-8 pt-6 border-t border-gray-200">
                    <p className="text-sm text-gray-600 text-center">
                        We typically respond within 24-48 hours. For urgent matters,
                        please include &quot;URGENT&quot; in your message.
                    </p>
                    <div className="mt-4 text-center">
                        <Link
                            href="/"
                            className="text-sm text-blue-600 hover:text-blue-800 transition-colors"
                        >
                            ← Back to Permits
                        </Link>
                    </div>
                </div>
            </div>
        </div>
    );
}


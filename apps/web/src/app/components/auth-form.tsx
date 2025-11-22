"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";

interface AuthFormProps {
    mode: "signin" | "signup";
    onClose?: () => void;
    onSwitchMode?: () => void;
}

export function AuthForm({ mode, onClose, onSwitchMode }: AuthFormProps) {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [name, setName] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setLoading(true);

        try {
            if (mode === "signup") {
                // Validate password match
                if (password !== confirmPassword) {
                    setError("Passwords do not match");
                    setLoading(false);
                    return;
                }

                // Call signup API
                const response = await fetch("/api/auth/signup", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ email, password, name }),
                });

                const data = await response.json();

                if (!response.ok) {
                    setError(data.error || "Failed to create account");
                    setLoading(false);
                    return;
                }

                // After successful signup, automatically sign in
                const signInResult = await signIn("credentials", {
                    email,
                    password,
                    redirect: false,
                });

                if (signInResult?.error) {
                    setError("Account created but sign-in failed. Please try signing in.");
                    setLoading(false);
                    return;
                }

                // Success - close modal and refresh
                if (onClose) onClose();
                window.location.reload();
            } else {
                // Sign in
                // First check if user exists and has OAuth accounts
                const checkUserResponse = await fetch(
                    `/api/auth/check-user?email=${encodeURIComponent(email)}`
                );
                const checkUserData = await checkUserResponse.json();

                if (
                    checkUserData.exists &&
                    checkUserData.hasOAuthAccounts &&
                    !checkUserData.hasPassword
                ) {
                    setError(
                        "This email is registered with Google. Please sign in with Google."
                    );
                    setLoading(false);
                    return;
                }

                const result = await signIn("credentials", {
                    email,
                    password,
                    redirect: false,
                });

                if (result?.error) {
                    setError("Invalid email or password");
                    setLoading(false);
                    return;
                }

                // Success - close modal and refresh
                if (onClose) onClose();
                window.location.reload();
            }
        } catch {
            setError("An unexpected error occurred. Please try again.");
            setLoading(false);
        }
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
                    {error}
                </div>
            )}

            {mode === "signup" && (
                <div>
                    <label
                        htmlFor="name"
                        className="block text-sm font-medium text-gray-700 mb-1"
                    >
                        Name (optional)
                    </label>
                    <input
                        id="name"
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 placeholder:text-gray-500"
                        placeholder="Your name"
                    />
                </div>
            )}

            <div>
                <label
                    htmlFor="email"
                    className="block text-sm font-medium text-gray-700 mb-1"
                >
                    Email
                </label>
                <input
                    id="email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 placeholder:text-gray-500"
                    placeholder="you@example.com"
                />
            </div>

            <div>
                <label
                    htmlFor="password"
                    className="block text-sm font-medium text-gray-700 mb-1"
                >
                    Password
                </label>
                <input
                    id="password"
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 placeholder:text-gray-500"
                    placeholder={mode === "signup" ? "At least 8 characters" : "Your password"}
                    minLength={mode === "signup" ? 8 : undefined}
                />
            </div>

            {mode === "signup" && (
                <div>
                    <label
                        htmlFor="confirmPassword"
                        className="block text-sm font-medium text-gray-700 mb-1"
                    >
                        Confirm Password
                    </label>
                    <input
                        id="confirmPassword"
                        type="password"
                        required
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 placeholder:text-gray-500"
                        placeholder="Confirm your password"
                    />
                </div>
            )}

            <button
                type="submit"
                disabled={loading}
                className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
                {loading
                    ? "Please wait..."
                    : mode === "signup"
                      ? "Sign Up"
                      : "Sign In"}
            </button>

            {onSwitchMode && (
                <div className="text-center text-sm text-gray-600">
                    {mode === "signup" ? (
                        <>
                            Already have an account?{" "}
                            <button
                                type="button"
                                onClick={onSwitchMode}
                                className="text-blue-600 hover:text-blue-700 font-medium"
                            >
                                Sign in
                            </button>
                        </>
                    ) : (
                        <>
                            Don&apos;t have an account?{" "}
                            <button
                                type="button"
                                onClick={onSwitchMode}
                                className="text-blue-600 hover:text-blue-700 font-medium"
                            >
                                Sign up
                            </button>
                        </>
                    )}
                </div>
            )}
        </form>
    );
}


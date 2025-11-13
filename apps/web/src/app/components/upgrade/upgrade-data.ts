export interface PremiumFeature {
    title: string;
    description: string;
    icon: string;
}

export interface ComparisonFeature {
    feature: string;
    freemium: string;
    premium: string;
}

export interface FAQItem {
    question: string;
    answer: string;
}

export const PREMIUM_FEATURES: PremiumFeature[] = [
    {
        title: "Unlimited Permit Access",
        description: "View all permits without the 3-permit limit",
        icon: "🔓",
    },
    {
        title: "Daily Email Updates",
        description: "Get daily emails with the latest permit information",
        icon: "📧",
    },
    {
        title: "Priority Support",
        description: "Get help when you need it most",
        icon: "💬",
    },
];

export const COMPARISON_FEATURES: ComparisonFeature[] = [
    {
        feature: "Permit Access",
        freemium: "3 permits",
        premium: "Unlimited",
    },
    {
        feature: "Daily Email Updates",
        freemium: "❌",
        premium: "✅",
    },
    {
        feature: "Priority Support",
        freemium: "❌",
        premium: "✅",
    },
];

export const FAQ_ITEMS: FAQItem[] = [
    {
        question: "Can I cancel anytime?",
        answer:
            "Yes, you can cancel your subscription at any time. You'll continue to have access until the end of your billing period.",
    },
    {
        question: "What payment methods do you accept?",
        answer:
            "We accept all major credit cards and debit cards through our secure Stripe payment processor.",
    },
];

export const PRICING = {
    price: 99.99,
    unit: "per month",
} as const;


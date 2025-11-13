"use client";

interface FAQItem {
    question: string;
    answer: string;
}

interface FAQSectionProps {
    items: FAQItem[];
}

export function FAQSection({ items }: FAQSectionProps) {
    return (
        <div className="max-w-4xl mx-auto">
            <h2 className="text-2xl font-bold text-gray-900 mb-6 text-center">
                Frequently Asked Questions
            </h2>
            <div className="space-y-4">
                {items.map((item, index) => (
                    <div
                        key={index}
                        className="bg-white rounded-lg shadow p-6"
                    >
                        <h3 className="font-semibold text-gray-900 mb-2">
                            {item.question}
                        </h3>
                        <p className="text-gray-600 text-sm">{item.answer}</p>
                    </div>
                ))}
            </div>
        </div>
    );
}


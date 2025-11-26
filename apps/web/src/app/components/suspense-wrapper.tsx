import { Suspense, ReactNode } from "react";
import { Header } from "./header";

interface SuspenseWrapperProps {
    children: ReactNode;
    fallback?: ReactNode;
}

/**
 * Reusable Suspense wrapper component for pages that use useSearchParams() or other
 * Next.js navigation hooks that require Suspense boundaries.
 * 
 * Usage:
 * ```tsx
 * export default function MyPage() {
 *   return (
 *     <SuspenseWrapper>
 *       <MyPageContent />
 *     </SuspenseWrapper>
 *   );
 * }
 * ```
 */
export function SuspenseWrapper({ children, fallback }: SuspenseWrapperProps) {
    const defaultFallback = (
        <div className="min-h-screen bg-blue-50">
            <Header />
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
                <div className="text-center py-12">
                    <p className="text-gray-500">Loading...</p>
                </div>
            </div>
        </div>
    );

    return (
        <Suspense fallback={fallback || defaultFallback}>
            {children}
        </Suspense>
    );
}


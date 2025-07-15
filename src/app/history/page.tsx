import ProtectedRoute from "@/app/components/ProtectedRoute";
import HistoryClient from "./HistoryClient";

export default function HistoryPage() {
    return (
        <ProtectedRoute>
            <main className="min-h-screen w-full p-8">
                <div className="mx-auto max-w-7xl">
                    <HistoryClient />
                </div>
            </main>
        </ProtectedRoute>
    )
} 
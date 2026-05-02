import { createAdminClient } from "@/lib/supabase/admin";
import DashboardRealtime from "@/components/DashboardRealtime";
import CostSummary from "@/components/CostSummary";
import { redirect } from "next/navigation";
import { currentUser } from "@clerk/nextjs/server";
import { isLocalDevDataMode, listRequestsForLandlord } from "@/lib/local-dev-store";

export default async function DashboardPage() {
  const user = await currentUser();
  if (!user) {
    redirect("/sign-in");
  }

  if (isLocalDevDataMode()) {
    const requests = listRequestsForLandlord(user.id);
    return (
      <div className="max-w-7xl mx-auto p-4 sm:p-8 space-y-8 pb-32">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-4">
          <div>
            <h1 className="text-4xl font-display font-bold uppercase tracking-tight text-navy">
              Command Center
            </h1>
            <p className="text-navy/70 border-l-4 border-accent pl-4 py-1 font-bold mt-2">
              Local development fallback mode is active.
            </p>
          </div>
        </div>

        <CostSummary requests={requests || []} />

        <section>
          <DashboardRealtime initialRequests={requests || []} />
        </section>
      </div>
    );
  }

  const supabase = createAdminClient();

  // Fetch all maintenance requests, assume landlord sees all (or filter by property metadata if complex multi-tenant)
  const { data: requests, error } = await supabase
    .from("maintenance_requests")
    .select(`
      *,
      units (
        unit_label,
        properties (
          address,
          city
        )
      )
    `)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Dashboard DB Error:", error);
    return (
      <div className="max-w-7xl mx-auto p-4 sm:p-8 mt-10 brutal-card">
        <h1 className="text-2xl font-bold font-display uppercase text-danger">Error Loading Dashboard</h1>
        <p className="text-navy">{error.message}</p>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto p-4 sm:p-8 space-y-8 pb-32">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-4">
        <div>
          <h1 className="text-4xl font-display font-bold uppercase tracking-tight text-navy">
            Command Center
          </h1>
          <p className="text-navy/70 border-l-4 border-accent pl-4 py-1 font-bold mt-2">
            Real-time portfolio maintenance oversight and orchestrator approvals.
          </p>
        </div>
      </div>

      <CostSummary requests={requests || []} />

      <section>
        <DashboardRealtime initialRequests={requests || []} />
      </section>
    </div>
  );
}

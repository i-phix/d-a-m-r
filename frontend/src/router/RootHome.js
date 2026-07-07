import React from "react";
import { useSelector } from "react-redux";
import DamrDashboard from "../components/facility/utility_management/meter_reading_management/dashboard/damr_dashboard";
import ResidentDashboard from "../components/resident_portal/resident_dashboard";

// Roadmap Phase 8 — residents log in through the same /auth/login endpoint
// and land on "/" like every other role, so this just decides which
// dashboard that actually renders instead of adding a redirect step.
function RootHome() {
  const user = useSelector((state) => state.damrReducer.user);
  if (user?.role === "user") {
    return <ResidentDashboard />;
  }
  return <DamrDashboard />;
}

export default RootHome;

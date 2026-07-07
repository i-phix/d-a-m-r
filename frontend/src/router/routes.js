import { createBrowserRouter } from "react-router-dom";
import Login from "../components/authentication/login";
import Error404Page from "../components/error/Error404Page";
import RootHome from "./RootHome";
import Meters from "../components/facility/utility_management/meter_reading_management/meter_management/meters";
import ViewMeter from "../components/facility/utility_management/meter_reading_management/meter_management/view_meter";
import Readings from "../components/facility/utility_management/meter_reading_management/reading_management/readings";
import UploadReading from "../components/facility/utility_management/meter_reading_management/reading_management/upload_reading";
import ManualReading from "../components/facility/utility_management/meter_reading_management/reading_management/manual_reading";
import Flags from "../components/facility/utility_management/meter_reading_management/flag_management/flags";
import ViewFlag from "../components/facility/utility_management/meter_reading_management/flag_management/view_flag";
import Invoices from "../components/facility/utility_management/meter_reading_management/invoice_management/invoices";
import ViewInvoice from "../components/facility/utility_management/meter_reading_management/invoice_management/view_invoice";
import PayInvoicePage from "../components/facility/utility_management/meter_reading_management/invoice_management/pay_invoice_page";
import Residents from "../components/facility/utility_management/meter_reading_management/resident_management/residents";
import ResidentHistory from "../components/facility/utility_management/meter_reading_management/resident_management/resident_history";
import Locations from "../components/facility/utility_management/meter_reading_management/facility_management/locations";
import Facilities from "../components/facility/utility_management/meter_reading_management/facility_management/facilities";
import Units from "../components/facility/utility_management/meter_reading_management/facility_management/units";
import Complex from "../components/facility/utility_management/meter_reading_management/facility_management/complex";
import UserManagement from "../components/facility/utility_management/meter_reading_management/user_management/user_management";
import PublicBillView from "../components/public/public_bill_view";
import StatementView from "../components/public/statement_view";
import Reports from "../components/facility/utility_management/meter_reading_management/reports/reports";
import ResidentReadings from "../components/resident_portal/resident_readings";
import ResidentBills from "../components/resident_portal/resident_bills";

export const router = createBrowserRouter(
  [
    { path: "/login", element: <Login /> },
    { path: "/bill/:token", element: <PublicBillView /> },
    { path: "/statement/:token", element: <StatementView /> },
    { path: "/", element: <RootHome /> },
    { path: "/resident/readings", element: <ResidentReadings /> },
    { path: "/resident/bills", element: <ResidentBills /> },
    { path: "/meters", element: <Meters /> },
    { path: "/meters/:id", element: <ViewMeter /> },
    { path: "/readings", element: <Readings /> },
    { path: "/readings/upload", element: <UploadReading /> },
    { path: "/readings/manual", element: <ManualReading /> },
    { path: "/flags", element: <Flags /> },
    { path: "/flags/:id", element: <ViewFlag /> },
    { path: "/invoices", element: <Invoices /> },
    { path: "/invoices/:id", element: <ViewInvoice /> },
    { path: "/invoices/:id/pay", element: <PayInvoicePage /> },
    { path: "/residents", element: <Residents /> },
    { path: "/residents/:id", element: <ResidentHistory /> },
    { path: "/facility/locations", element: <Locations /> },
    { path: "/facility/facilities", element: <Facilities /> },
    { path: "/users", element: <UserManagement /> },
    { path: "/facility/units", element: <Units /> },
    { path: "/facility/complex", element: <Complex /> },
    { path: "/reports", element: <Reports /> },
    { path: "*", element: <Error404Page /> },
  ],
  {
    future: {
      v7_startTransition: true,
    },
  },
);

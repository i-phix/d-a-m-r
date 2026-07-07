import React, { useEffect, useState, useRef } from "react";
import { useLocation, Link, useNavigate } from "react-router-dom";
import { Accordion, AccordionTab } from "primereact/accordion";
import { useDispatch, useSelector } from "react-redux";
import { clearCredentials } from "../../features/damr/damrReducer";
import { removeItem } from "../../utils/localStorage";

function Nav() {
  const location = useLocation();
  const currentPath = location.pathname;
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const navbarContentRef = useRef(null);
  const [scrollPosition, setScrollPosition] = useState(0);
  const [activeIndex, setActiveIndex] = useState(null);

  const user = useSelector((state) => state.damrReducer.user);
  const userRole = user?.role || "";
  const userName = user?.fullName || user?.email || "";

  const handleLogout = async () => {
    await removeItem("DAMR_USER");
    dispatch(clearCredentials());
    navigate("/login");
  };

  const handleLinkClick = () => {
    if (navbarContentRef.current) {
      setScrollPosition(navbarContentRef.current.scrollTop);
    }
  };

  useEffect(() => {
    if (navbarContentRef.current) {
      navbarContentRef.current.scrollTop = scrollPosition;
    }
  }, [currentPath, scrollPosition]);

  const getInitialActiveIndex = (path) => {
    if (path.includes("meter")) return 0;
    if (path.includes("reading")) return 1;
    if (path.includes("flag")) return 2;
    if (path.includes("invoice")) return 3;
    if (path.includes("resident")) return 4;
    if (path.includes("facility")) return 5;
    if (path.includes("report")) return 6;
    return null;
  };

  useEffect(() => {
    setActiveIndex(getInitialActiveIndex(currentPath));
  }, [currentPath]);

  const isActive = (path) => (currentPath === path ? "active" : "");

  const AccordionHeader = ({ label }) => (
    <div className="flex align-items-center text-dark">
      <span>{label}</span>
    </div>
  );

  // Roadmap Phase 8 — resident portal. A completely separate, minimal nav
  // for role "user" (resident) accounts — none of the staff sidebar
  // (Meters, Add Meter, Facilities, etc.) should ever render for them, even
  // though the backend already independently blocks every staff endpoint
  // via residentOnly/allowRoles. This is the UX half of that boundary.
  if (userRole === "user") {
    return (
      <nav className="pc-sidebar">
        <div className="navbar-wrapper">
          <div className="m-header">
            <Link to="/" className="b-brand text-primary">
              <img
                src="/assets/images/damr-logo.png"
                className="img-fluid logo-lg"
                alt="DAMR logo"
                style={{ width: 150, height: 70, objectFit: "contain" }}
              />
            </Link>
          </div>
          <div className="navbar-content" style={{ overflowY: "scroll" }}>
            <div className="card pc-user-card">
              <div className="card-body">
                <div className="d-flex align-items-center">
                  <div className="flex-shrink-0">
                    <img
                      src="/assets/images/user/avatar-1.jpg"
                      alt="user"
                      className="user-avtar wid-45 rounded-circle"
                    />
                  </div>
                  <div className="flex-grow-1 ms-3 me-2">
                    <h6 className="mb-0">{userName}</h6>
                    <small className="text-muted">Resident</small>
                  </div>
                </div>
                <div className="pt-3">
                  <Link to="#!" onClick={handleLogout}>
                    <i className="ti ti-power" />
                    <span> Logout</span>
                  </Link>
                </div>
              </div>
            </div>

            <ul className="pc-navbar mb-5">
              <li className={`pc-item ${isActive("/")}`}>
                <Link to="/" className="pc-link" onClick={handleLinkClick}>
                  <span className="pc-micon">
                    <svg className="pc-icon">
                      <use xlinkHref="#custom-home" />
                    </svg>
                  </span>
                  <span className="pc-mtext">My Unit</span>
                </Link>
              </li>
              <li className={`pc-item ${isActive("/resident/readings")}`}>
                <Link
                  to="/resident/readings"
                  className="pc-link"
                  onClick={handleLinkClick}
                >
                  <span className="pc-micon">
                    <svg className="pc-icon">
                      <use xlinkHref="#custom-graph" />
                    </svg>
                  </span>
                  <span className="pc-mtext">My Readings</span>
                </Link>
              </li>
              <li className={`pc-item ${isActive("/resident/bills")}`}>
                <Link
                  to="/resident/bills"
                  className="pc-link"
                  onClick={handleLinkClick}
                >
                  <span className="pc-micon">
                    <svg className="pc-icon">
                      <use xlinkHref="#custom-note-1" />
                    </svg>
                  </span>
                  <span className="pc-mtext">My Bills</span>
                </Link>
              </li>
            </ul>
          </div>
        </div>
      </nav>
    );
  }

  return (
    <nav className="pc-sidebar">
      <div className="navbar-wrapper">
        <div className="m-header">
          <Link to="/" className="b-brand text-primary">
            <img
              src="/assets/images/damr-logo.png"
              className="img-fluid logo-lg"
              alt="DAMR logo"
              style={{ width: 150, height: 70, objectFit: "contain" }}
            />
            <span className="badge bg-light-success rounded-pill ms-2 theme-version">
              v1.0
            </span>
          </Link>
        </div>

        <div
          className="navbar-content"
          ref={navbarContentRef}
          style={{ overflowY: "scroll" }}
        >
          {/* User card */}
          <div className="card pc-user-card">
            <div className="card-body">
              <div className="d-flex align-items-center">
                <div className="flex-shrink-0">
                  <img
                    src="/assets/images/user/avatar-1.jpg"
                    alt="user"
                    className="user-avtar wid-45 rounded-circle"
                  />
                </div>
                <div className="flex-grow-1 ms-3 me-2">
                  <h6 className="mb-0">{userName}</h6>
                  <small className="text-muted text-capitalize">
                    {userRole}
                  </small>
                </div>
                <Link
                  className="btn btn-icon btn-link-secondary avtar"
                  data-bs-toggle="collapse"
                  to="#pc_sidebar_userlink"
                >
                  <svg className="pc-icon">
                    <use xlinkHref="#custom-sort-outline" />
                  </svg>
                </Link>
              </div>

              <div className="collapse pc-user-links" id="pc_sidebar_userlink">
                <div className="pt-3">
                  <Link to="#!" onClick={handleLogout}>
                    <i className="ti ti-power" />
                    <span>Logout</span>
                  </Link>
                </div>
              </div>
            </div>
          </div>

          {/* Nav items */}
          <ul className="pc-navbar mb-5">
            {/* Dashboard — all roles */}
            <li className={`pc-item ${isActive("/")}`}>
              <Link to="/" className="pc-link" onClick={handleLinkClick}>
                <span className="pc-micon">
                  <svg className="pc-icon">
                    <use xlinkHref="#custom-home" />
                  </svg>
                </span>
                <span className="pc-mtext">Dashboard</span>
              </Link>
            </li>

            <Accordion
              activeIndex={activeIndex}
              onTabChange={(e) => setActiveIndex(e.index)}
            >
              {/* Meter Management — admin + editor only */}
              {userRole !== "Staff" && (
                <AccordionTab
                  header={<AccordionHeader label="Meter Management" />}
                >
                  <li className={`pc-item ${isActive("/meters")}`}>
                    <Link
                      to="/meters"
                      className="pc-link"
                      onClick={handleLinkClick}
                    >
                      <span className="pc-micon">
                        <svg className="pc-icon">
                          <use xlinkHref="#custom-cpu-charge" />
                        </svg>
                      </span>
                      <span className="pc-mtext">Meters</span>
                    </Link>
                  </li>
                  <li className={`pc-item ${isActive("/meters/add")}`}>
                    <Link
                      to="/meters"
                      state={{ activeTab: "add" }}
                      className="pc-link"
                      onClick={handleLinkClick}
                    >
                      <span className="pc-micon">
                        <svg className="pc-icon">
                          <use xlinkHref="#custom-element-plus" />
                        </svg>
                      </span>
                      <span className="pc-mtext">Add Meter</span>
                    </Link>
                  </li>
                </AccordionTab>
              )}

              {/* Meter Reading — all roles */}
              <AccordionTab header={<AccordionHeader label="Meter Reading" />}>
                <li className={`pc-item ${isActive("/readings")}`}>
                  <Link
                    to="/readings"
                    className="pc-link"
                    onClick={handleLinkClick}
                  >
                    <span className="pc-micon">
                      <svg className="pc-icon">
                        <use xlinkHref="#custom-graph" />
                      </svg>
                    </span>
                    <span className="pc-mtext">All Readings</span>
                  </Link>
                </li>
                <li className={`pc-item ${isActive("/readings/upload")}`}>
                  <Link
                    to="/readings/upload"
                    className="pc-link"
                    onClick={handleLinkClick}
                  >
                    <span className="pc-micon">
                      <svg className="pc-icon">
                        <use xlinkHref="#custom-direct-inbox" />
                      </svg>
                    </span>
                    <span className="pc-mtext">Upload Reading</span>
                  </Link>
                </li>
                <li className={`pc-item ${isActive("/readings/manual")}`}>
                  <Link
                    to="/readings/manual"
                    className="pc-link"
                    onClick={handleLinkClick}
                  >
                    <span className="pc-micon">
                      <svg className="pc-icon">
                        <use xlinkHref="#custom-keyboard" />
                      </svg>
                    </span>
                    <span className="pc-mtext">Manual Reading</span>
                  </Link>
                </li>
              </AccordionTab>

              {/* Flags — all roles */}
              <AccordionTab header={<AccordionHeader label="Flags" />}>
                <li className={`pc-item ${isActive("/flags")}`}>
                  <Link
                    to="/flags"
                    className="pc-link"
                    onClick={handleLinkClick}
                  >
                    <span className="pc-micon">
                      <svg className="pc-icon">
                        <use xlinkHref="#custom-flag" />
                      </svg>
                    </span>
                    <span className="pc-mtext">All Flags</span>
                  </Link>
                </li>
              </AccordionTab>

              {/* Invoices — admin + editor only */}
              {userRole !== "Staff" && (
                <AccordionTab header={<AccordionHeader label="Invoices" />}>
                  <li className={`pc-item ${isActive("/invoices")}`}>
                    <Link
                      to="/invoices"
                      className="pc-link"
                      onClick={handleLinkClick}
                    >
                      <span className="pc-micon">
                        <svg className="pc-icon">
                          <use xlinkHref="#custom-note-1" />
                        </svg>
                      </span>
                      <span className="pc-mtext">All Invoices</span>
                    </Link>
                  </li>
                </AccordionTab>
              )}

              {/* Residents — admin + editor only */}
              {userRole !== "Staff" && (
                <AccordionTab header={<AccordionHeader label="Residents" />}>
                  <li className={`pc-item ${isActive("/residents")}`}>
                    <Link
                      to="/residents"
                      className="pc-link"
                      onClick={handleLinkClick}
                    >
                      <span className="pc-micon">
                        <svg className="pc-icon">
                          <use xlinkHref="#custom-profile-2user-outline" />
                        </svg>
                      </span>
                      <span className="pc-mtext">All Residents</span>
                    </Link>
                  </li>
                  <li className={`pc-item ${isActive("/residents/add")}`}>
                    <Link
                      to="/residents"
                      state={{ activeTab: "add" }}
                      className="pc-link"
                      onClick={handleLinkClick}
                    >
                      <span className="pc-micon">
                        <svg className="pc-icon">
                          <use xlinkHref="#custom-element-plus" />
                        </svg>
                      </span>
                      <span className="pc-mtext">Add Resident</span>
                    </Link>
                  </li>
                </AccordionTab>
              )}

              {/* Facilities — admin + editor. Complex/Units are backed by
                  adminOrFM on the API (Facility Managers can create/edit
                  both for their own facility), so they must render here too
                  — only whole-Facility creation and Locations are actually
                  adminOnly on the backend, so those two stay admin-gated. */}
              {userRole !== "Staff" && (
                <AccordionTab header={<AccordionHeader label="Facilities" />}>
                  {userRole === "admin" && (
                    <li
                      className={`pc-item ${isActive("/facility/facilities")}`}
                    >
                      <Link
                        to="/facility/facilities"
                        className="pc-link"
                        onClick={handleLinkClick}
                      >
                        <span className="pc-micon">
                          <svg className="pc-icon">
                            <use xlinkHref="#custom-box-1" />
                          </svg>
                        </span>
                        <span className="pc-mtext">Facilities</span>
                      </Link>
                    </li>
                  )}
                  <li className={`pc-item ${isActive("/facility/complex")}`}>
                    <Link
                      to="/facility/complex"
                      className="pc-link"
                      onClick={handleLinkClick}
                    >
                      <span className="pc-micon">
                        <svg className="pc-icon">
                          <use xlinkHref="#custom-layer" />
                        </svg>
                      </span>
                      <span className="pc-mtext">Complex</span>
                    </Link>
                  </li>
                  <li className={`pc-item ${isActive("/facility/units")}`}>
                    <Link
                      to="/facility/units"
                      className="pc-link"
                      onClick={handleLinkClick}
                    >
                      <span className="pc-micon">
                        <svg className="pc-icon">
                          <use xlinkHref="#custom-element-plus" />
                        </svg>
                      </span>
                      <span className="pc-mtext">Units</span>
                    </Link>
                  </li>
                  {userRole === "admin" && (
                    <li
                      className={`pc-item ${isActive("/facility/locations")}`}
                    >
                      <Link
                        to="/facility/locations"
                        className="pc-link"
                        onClick={handleLinkClick}
                      >
                        <span className="pc-micon">
                          <svg className="pc-icon">
                            <use xlinkHref="#custom-data" />
                          </svg>
                        </span>
                        <span className="pc-mtext">Locations</span>
                      </Link>
                    </li>
                  )}
                </AccordionTab>
              )}
              {/* Reports — admin + editor only */}
              {userRole !== "Staff" && (
                <AccordionTab header={<AccordionHeader label="Reports" />}>
                  <li className={`pc-item ${isActive("/reports")}`}>
                    <Link
                      to="/reports"
                      className="pc-link"
                      onClick={handleLinkClick}
                    >
                      <span className="pc-micon">
                        <svg className="pc-icon">
                          <use xlinkHref="#custom-graph" />
                        </svg>
                      </span>
                      <span className="pc-mtext">Ageing, Defaulters & NRW</span>
                    </Link>
                  </li>
                </AccordionTab>
              )}
              <AccordionTab header={<AccordionHeader label="Users" />}>
                <li className={`pc-item ${isActive("/users")}`}>
                  <Link
                    to="/users"
                    className="pc-link"
                    onClick={handleLinkClick}
                  >
                    <span className="pc-micon">
                      <svg className="pc-icon">
                        <use xlinkHref="#custom-profile-2user-outline" />
                      </svg>
                    </span>
                    <span className="pc-mtext">Manage Users</span>
                  </Link>
                </li>
              </AccordionTab>
            </Accordion>
          </ul>
        </div>
      </div>
    </nav>
  );
}

export default Nav;

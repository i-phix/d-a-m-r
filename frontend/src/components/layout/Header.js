import React, { useState, useRef, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { clearCredentials } from '../../features/damr/damrReducer';
import { removeItem } from '../../utils/localStorage';

function Header() {
    const navigate = useNavigate();
    const dispatch = useDispatch();
    const dropdownRef = useRef(null);

    const user = useSelector((state) => state.damrReducer.user);
    const userName = user?.fullName || user?.email?.split('@')[0] || '';
    const userEmail = user?.email || '';

    const [showNotifications, setShowNotifications] = useState(false);
    const [notifications] = useState([]); // TODO: wire to backend notification endpoint

    const handleLogout = async () => {
        await removeItem('DAMR_USER');
        dispatch(clearCredentials());
        navigate('/login');
    };

    // Close notifications dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
                setShowNotifications(false);
            }
        };
        if (showNotifications) {
            document.addEventListener('mousedown', handleClickOutside);
        }
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [showNotifications]);

    return (
        <header className="pc-header">
            <div className="header-wrapper">

                {/* Left — sidebar toggle */}
                <div className="me-auto pc-mob-drp">
                    <ul className="list-unstyled">
                        <li className="pc-h-item pc-sidebar-collapse">
                            <Link to="#" className="pc-head-link ms-0" id="sidebar-hide">
                                <i className="ti ti-menu-2"></i>
                            </Link>
                        </li>
                        <li className="pc-h-item pc-sidebar-popup">
                            <Link to="#" className="pc-head-link ms-0 mobile-collapse">
                                <i className="ti ti-menu-2"></i>
                            </Link>
                        </li>
                    </ul>
                </div>

                {/* Right — notifications + profile */}
                <div className="ms-auto">
                    <ul className="list-unstyled">

                        {/* Notification bell */}
                        <li className="dropdown pc-h-item" ref={dropdownRef}>
                            <button
                                className="pc-head-link dropdown-toggle arrow-none me-0 btn btn-link"
                                type="button"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setShowNotifications((prev) => !prev);
                                }}
                            >
                                <svg className="pc-icon">
                                    <use href="#custom-notification"></use>
                                </svg>
                                {notifications.length > 0 && (
                                    <span className="badge bg-success pc-h-badge">
                                        {notifications.length}
                                    </span>
                                )}
                            </button>

                            {showNotifications && (
                                <div className="dropdown-menu dropdown-notification dropdown-menu-end pc-h-dropdown show">
                                    <div className="dropdown-header d-flex align-items-center justify-content-between">
                                        <h5 className="m-0">Notifications</h5>
                                    </div>
                                    <div
                                        className="dropdown-body text-wrap header-notification-scroll position-relative"
                                        style={{ maxHeight: 'calc(100vh - 215px)', overflowY: 'auto' }}
                                    >
                                        <div className="text-center p-3 text-muted">
                                            <i className="ti ti-bell-off mb-2" style={{ fontSize: '2rem' }}></i>
                                            <p className="mb-0">No unread notifications</p>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </li>

                        {/* User profile dropdown */}
                        <li className="dropdown pc-h-item header-user-profile">
                            <Link
                                className="pc-head-link dropdown-toggle arrow-none me-0"
                                data-bs-toggle="dropdown"
                                to="#"
                                role="button"
                                aria-haspopup="false"
                                data-bs-auto-close="outside"
                                aria-expanded="false"
                            >
                                <img
                                    src="/assets/images/user/avatar-2.jpg"
                                    alt="user"
                                    className="user-avtar"
                                />
                            </Link>

                            <div className="dropdown-menu dropdown-user-profile dropdown-menu-end pc-h-dropdown">
                                <div className="dropdown-header d-flex align-items-center justify-content-between">
                                    <h5 className="m-0">Profile</h5>
                                </div>
                                <div className="dropdown-body">
                                    <div
                                        className="profile-notification-scroll position-relative"
                                        style={{ maxHeight: 'calc(100vh - 225px)' }}
                                    >
                                        <div className="d-flex mb-1">
                                            <div className="flex-shrink-0">
                                                <img
                                                    src="/assets/images/user/avatar-2.jpg"
                                                    alt="user"
                                                    className="user-avtar wid-35"
                                                />
                                            </div>
                                            <div className="flex-grow-1 ms-3">
                                                <h6 className="mb-1">{userName}</h6>
                                                <span>{userEmail}</span>
                                            </div>
                                        </div>

                                        <hr className="border-secondary border-opacity-50" />

                                        <div className="d-grid mb-3">
                                            <button
                                                className="btn btn-primary"
                                                onClick={handleLogout}
                                            >
                                                <svg className="pc-icon me-2">
                                                    <use href="#custom-logout-1-outline"></use>
                                                </svg>
                                                Logout
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </li>

                    </ul>
                </div>
            </div>
        </header>
    );
}

export default Header;

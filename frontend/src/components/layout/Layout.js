import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import Nav from './Nav';
import Header from './Header';
import Footer from './Footer';

function Layout({ children }) {
    const navigate = useNavigate();
    const token = useSelector((state) => state.damrReducer.token);

    // Guard: redirect to login if no token
    useEffect(() => {
        if (!token) {
            navigate('/login');
        }
    }, [token, navigate]);

    if (!token) return null;

    return (
        <>
            <Nav />
            <Header />
            <div className="pc-container">
                <div className="pc-content">
                    {children}
                </div>
            </div>
            <Footer />
        </>
    );
}

export default Layout;

import { Link } from 'react-router-dom';

function Footer() {
    return (
        <footer className="pc-footer">
            <div className="footer-wrapper container-fluid">
                <div className="row">
                    <div className="col my-1">
                        <p className="m-0">DAMR &hearts; PayServe &copy; {new Date().getFullYear()}</p>
                    </div>
                    <div className="col-auto my-1">
                        <ul className="list-inline footer-link mb-0">
                            <li className="list-inline-item"><Link to="/">Home</Link></li>
                        </ul>
                    </div>
                </div>
            </div>
        </footer>
    );
}

export default Footer;

import React, { useEffect, useState } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { useNavigate } from "react-router-dom";
import {
  inputLoginEmail,
  inputLoginPassword,
  setCredentials,
  updateSpinner,
} from '../../features/damr/damrReducer';
import { setItem, getItem } from '../../utils/localStorage';
import { makeRequest } from '../../utils/makeRequest';
import { toastify } from '../../utils/toast';
import { loginURL } from '../../utils/urls';

function Login() {
  const loginEmail = useSelector((state) => state.damrReducer.loginEmail);
  const loginPassword = useSelector((state) => state.damrReducer.loginPassword);
  const spinner = useSelector((state) => state.damrReducer.spinner);
  const [showPassword, setShowPassword] = useState(false);
  const dispatch = useDispatch();
  const navigate = useNavigate();

  const handleLogin = async () => {
    if (loginEmail === '') {
      toastify('Email is required', 'error');
      return;
    }
    if (loginPassword === '') {
      toastify('Password is required', 'error');
      return;
    }

    try {
      dispatch(updateSpinner(true));

      const body = { email: loginEmail, password: loginPassword };
      const response = await makeRequest(loginURL, 'POST', body);

      if (response.success) {
        const { token, user } = response.data;
        await setItem('DAMR_USER', { token, user });
        dispatch(setCredentials({ token, user }));
        toastify('Login successful', 'success');
        navigate('/');
      } else {
        toastify(response.error, 'error');
      }
    } catch (err) {
      toastify(err.message, 'error');
    } finally {
      dispatch(updateSpinner(false));
    }
  };

  const checkExistingSession = async () => {
    const damrUser = await getItem('DAMR_USER');
    if (damrUser && damrUser.token) {
      dispatch(setCredentials({ token: damrUser.token, user: damrUser.user }));
      navigate('/');
    }
  };

  useEffect(() => {
    checkExistingSession();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="auth-main">
      <div className="auth-wrapper v2">
        <div className="auth-form">
          <div className="card my-5">
            <div className="card-body">
              <div className="text-center">
                <img src="/assets/images/damr-logo.png" alt="DAMR" style={{ width: 220, marginBottom: 10 }} />
              </div>

              <h3 className="text-center f-w-500 mb-3"><b>Sign in to DAMR</b></h3>

              <form onSubmit={(e) => { e.preventDefault(); handleLogin(); }}>
                <div className="mb-3">
                  <input
                    type="email"
                    className="form-control"
                    id="floatingInput"
                    value={loginEmail}
                    onChange={(e) => dispatch(inputLoginEmail(e.target.value))}
                    placeholder="Email"
                  />
                </div>
                <div className="mb-3 position-relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    className="form-control"
                    placeholder="Password"
                    value={loginPassword}
                    onChange={(e) => dispatch(inputLoginPassword(e.target.value))}
                  />
                  <button
                    type="button"
                    className="btn btn-link position-absolute end-0 top-0 mt-1 me-2"
                    onClick={() => setShowPassword((prev) => !prev)}
                    aria-label="Toggle password visibility"
                  >
                    <i className={`fas ${showPassword ? 'fa-eye-slash' : 'fa-eye'}`}></i>
                  </button>
                </div>
                <div className="d-grid mt-4">
                  <button type="submit" className="btn btn-primary" disabled={spinner}>
                    {spinner ? 'Signing in...' : 'Login'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Login;

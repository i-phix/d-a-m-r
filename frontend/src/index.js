import React from "react";
import ReactDOM from "react-dom/client";
import "./index.css";
import App from "./App";
import { Provider } from "react-redux";
import { store, persistor } from "./app/store";
import { ToastContainer } from "react-toastify";
import { PersistGate } from "redux-persist/integration/react";
import { PrimeReactProvider } from "primereact/api";

const root = ReactDOM.createRoot(document.getElementById("root"));

root.render(
  <PersistGate persistor={persistor}>
    <Provider store={store}>
      <PrimeReactProvider>
        <App />
      </PrimeReactProvider>
      <ToastContainer />
    </Provider>
  </PersistGate>,
);

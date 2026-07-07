import React from "react";
import { useSelector } from "react-redux";
import { RouterProvider } from "react-router-dom";
import { router } from "./router/routes";

function App() {
  const spinner = useSelector((state) => state.damrReducer.spinner);
  return (
    <React.StrictMode>
      {spinner && (
        <div className="page-loader">
          <div className="bar"></div>
        </div>
      )}

      <RouterProvider router={router} />
    </React.StrictMode>
  );
}

export default App;

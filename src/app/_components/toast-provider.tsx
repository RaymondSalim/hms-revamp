"use client";

import { ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";

export function ToastProvider() {
  return (
    <ToastContainer
      position="top-right"
      autoClose={4000}
      hideProgressBar={false}
      newestOnTop
      closeOnClick
      rtl={false}
      pauseOnFocusLoss
      draggable
      pauseOnHover
      theme="light"
      toastStyle={{
        borderRadius: "var(--radius-md)",
        boxShadow: "var(--shadow-lg)",
        fontFamily: "var(--font-body), system-ui, sans-serif",
      }}
    />
  );
}

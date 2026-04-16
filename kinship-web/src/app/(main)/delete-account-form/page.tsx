"use client";
import React, { FormEvent, useState } from "react";
import client from "@/app/(main)/lib/httpClient";
import Input from "../components/common/Input";

const DeleteAccountForm = () => {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [reason, setReason] = useState("");

  const [status, setStatus] = useState("idle"); // 'idle', 'submitting', 'success', 'error'
  const [error, setError] = useState<String | null>(null);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); // Prevent default form submission behavior

    // Basic validation
    if (!name || !email || !reason) {
      setStatus("error");
      setError("All fields are required. Please fill out the entire form.");
      return;
    }

    setStatus("submitting");
    setError(null);

    try {
      client.post("/account-deletion", {
        name,
        email,
        reason,
      });

      setStatus("success");
      setName("");
      setEmail("");
      setReason("");
    } catch (err) {
      setStatus("error");
      setError("An unexpected error occurred. Please try again later.");
      console.error("Submission failed:", err);
    }
  };

  // Render success message
  if (status === "success") {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 font-sans">
        <div className="w-full max-w-md text-center p-8 rounded-xl shadow-lg border-[1px] border-[#FFFFFF26]">
          <svg
            className="mx-auto h-16 w-16 text-green-500"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <h1 className="text-2xl font-bold text-white mt-4">
            Request Received!
          </h1>
          <p className="text-white mt-2">
            Thank you for your submission. We have received your account
            deletion request and will process it within the next 7 business
            days. A confirmation will be sent to your email address.
          </p>
        </div>
      </div>
    );
  }

  // Render the form
  return (
    <div className="min-h-screen flex items-center justify-center p-4 font-sans">
      <div className="w-full max-w-md">
        <div className="p-12 rounded-xl shadow-lg border-[1px] border-[#FFFFFF26]">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-white">
              Account Deletion Request
            </h1>
            <p className="text-white mt-2">
              Please fill out the form below to request the deletion of your
              account.
            </p>
          </div>

          <form onSubmit={handleSubmit} noValidate>
            <div className="mb-4">
              <Input
                title="Name"
                type="text"
                value={name}
                required={false}
                onChange={(e) => setName(e.target.value)}
                placeholder="Name"
                readonly={status === "submitting"}
              />
            </div>

            <div className="mb-4">
              <Input
                title="Email"
                type="text"
                value={email}
                required={false}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Email"
                readonly={status === "submitting"}
              />
            </div>

            <div className="mb-6">
              <Input
                title="Reason for deletion"
                type="text"
                textarea
                value={reason}
                required={false}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Email"
                readonly={status === "submitting"}
              />
            </div>

            {status === "error" && (
              <div
                className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded-lg relative mb-4"
                role="alert"
              >
                <span className="block sm:inline">{error}</span>
              </div>
            )}

            <div>
              <button
                type="submit"
                className={`w-full text-white font-bold py-3 px-4 rounded-lg transition duration-300 ease-in-out flex items-center justify-center ${status === "submitting"
                    ? "bg-gray-400 cursor-not-allowed"
                    : "bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                  }`}
                disabled={status === "submitting"}
              >
                {status === "submitting" ? (
                  <>
                    <span className="loading loading-spinner loading-lg bg-[#BEEF00]"></span>
                    Submitting...
                  </>
                ) : (
                  "Submit"
                )}
              </button>
            </div>
          </form>
        </div>
        <p className="text-center text-gray-500 text-xs mt-4">
          Your data will be handled in accordance with our privacy policy.
        </p>
      </div>
    </div>
  );
};

export default DeleteAccountForm;

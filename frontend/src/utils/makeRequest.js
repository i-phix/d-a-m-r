import axios from "axios";
import { backend_url } from "./urls";
import { getItem } from "./localStorage";

export async function makeRequest(url, method, body) {
  try {
    const options = {
      method: method,
      url: backend_url + url,
      data:
        method === "POST" ||
        method === "PUT" ||
        method === "PATCH" ||
        method === "DELETE"
          ? body
          : undefined,
      responseType: "json",
    };

    const response = await axios(options);

    if (response.status === 200) {
      return { success: true, data: response.data };
    } else {
      return {
        success: false,
        error: `Error: ${response.status} - ${response.data.error}`,
      };
    }
  } catch (error) {
    let errorMessage;

    if (error.response) {
      errorMessage = `Error: ${error.response.status} - ${error.response.data.error}`;
    } else if (error.request) {
      errorMessage = "Error: No response received from server";
    } else {
      errorMessage = `Error: ${error.message}`;
    }
    return { success: false, error: errorMessage };
  }
}

// Authenticated request — attaches the Bearer token stored after login
export async function makeAuthRequest(url, method, body) {
  try {
    const damrUser = await getItem("DAMR_USER");
    if (!damrUser || !damrUser.token) {
      throw new Error("Authentication token not found");
    }

    const options = {
      method: method,
      url: backend_url + url,
      data:
        method === "POST" ||
        method === "PUT" ||
        method === "PATCH" ||
        method === "DELETE"
          ? body
          : undefined,
      responseType: "json",
      headers: {
        Authorization: `Bearer ${damrUser.token}`,
      },
    };

    const response = await axios(options);

    if (response.status === 200) {
      return { success: true, data: response.data };
    } else {
      return {
        success: false,
        error: `Error: ${response.status} - ${response.data.error}`,
      };
    }
  } catch (error) {
    let errorMessage;

    if (error.response) {
      errorMessage = `Error: ${error.response.status} - ${error.response.data.error}`;
    } else if (error.request) {
      errorMessage = "Error: No response received from server";
    } else {
      errorMessage = `Error: ${error.message}`;
    }
    return { success: false, error: errorMessage };
  }
}

import { state } from "./state.js";

export async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(`${state.baseUrl}${path}`);
  if (!res.ok) throw new Error(`API error ${res.status}: ${await res.text()}`);
  return res.json() as Promise<T>;
}

export async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${state.baseUrl}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`API error ${res.status}: ${await res.text()}`);
  return res.json() as Promise<T>;
}

export async function apiPostFormData<T>(path: string, form: FormData): Promise<T> {
  const res = await fetch(`${state.baseUrl}${path}`, { method: "POST", body: form });
  if (!res.ok) throw new Error(`API error ${res.status}: ${await res.text()}`);
  return res.json() as Promise<T>;
}

export async function apiGetText(path: string): Promise<string> {
  const res = await fetch(`${state.baseUrl}${path}`);
  if (!res.ok) throw new Error(`API error ${res.status}: ${await res.text()}`);
  return res.text();
}

export async function apiGetBinary(path: string): Promise<ArrayBuffer> {
  const res = await fetch(`${state.baseUrl}${path}`);
  if (!res.ok) throw new Error(`API error ${res.status}: ${await res.text()}`);
  return res.arrayBuffer();
}

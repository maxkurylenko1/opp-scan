"use client";

import { useFormStatus } from "react-dom";

export default function ScanButton() {
  const { pending } = useFormStatus();
  return <button type="submit" disabled={pending}>{pending ? "Scanning… this can take a few minutes" : "Run full Radar scan"}</button>;
}

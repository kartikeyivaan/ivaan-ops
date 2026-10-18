export {};

declare global {
  interface Window {
    agentApi: {
      getDefaults: () => Promise<{ defaultBaseUrl: string; agentVersion: string }>;
      pair: (input: { pairingCode: string; baseUrl: string; label?: string }) => Promise<{ ok: true }>;
    };
  }
}

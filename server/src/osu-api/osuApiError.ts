export default class OsuApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly authentication?: string,
    public readonly apiMessage?: string,
  ) {
    super(apiMessage ?? authentication ?? `osu! api returned ${status}`);
    this.name = "OsuApiError";
  }

  get isUnauthorized(): boolean {
    return this.status === 401;
  }

  static async fromResponse(response: Response): Promise<OsuApiError> {
    const rawBody = await response.text();

    if (!rawBody) {
      return new OsuApiError(response.status);
    }

    try {
      const parsed = JSON.parse(rawBody) as {
        authentication?: string;
        error?: string | null;
      };
      return new OsuApiError(response.status, parsed.authentication, parsed.error ?? undefined);
    } catch {
      return new OsuApiError(response.status, undefined, rawBody.slice(0, 200));
    }
  }
}

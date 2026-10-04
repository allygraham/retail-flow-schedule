export interface MockResponse { data: unknown; error: { message: string } | null }
export type MockResult = MockResponse | Promise<MockResponse>;

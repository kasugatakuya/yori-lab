import { describe, expect, it } from "vitest";
import { RateLimiter } from "./rate-limiter";

function fakeClock() {
  let t = 0;
  const sleeps: number[] = [];
  return {
    now: () => t,
    sleep: async (ms: number) => {
      sleeps.push(ms);
      t += ms;
    },
    advance: (ms: number) => {
      t += ms;
    },
    sleeps,
  };
}

describe("RateLimiter（spread なし）", () => {
  it("上限までは待たず、超えたらウィンドウ経過まで待つ", async () => {
    const clock = fakeClock();
    const rl = new RateLimiter({ maxRequests: 5, windowMs: 60_000, marginMs: 1, spread: false, now: clock.now, sleep: clock.sleep });
    for (let i = 0; i < 5; i++) await rl.acquire();
    expect(clock.sleeps).toHaveLength(0);
    expect(rl.inFlight).toBe(5);
    await rl.acquire(); // 6件目
    expect(clock.sleeps).toEqual([60_001]);
    expect(rl.inFlight).toBe(1);
  });

  it("時間が経過していれば待たない", async () => {
    const clock = fakeClock();
    const rl = new RateLimiter({ maxRequests: 2, windowMs: 1000, marginMs: 1, spread: false, now: clock.now, sleep: clock.sleep });
    await rl.acquire();
    clock.advance(600);
    await rl.acquire();
    clock.advance(500);
    await rl.acquire();
    expect(clock.sleeps).toHaveLength(0);
  });

  it("同時呼び出しも直列化される", async () => {
    const clock = fakeClock();
    const rl = new RateLimiter({ maxRequests: 2, windowMs: 1000, marginMs: 1, spread: false, now: clock.now, sleep: clock.sleep });
    await Promise.all([rl.acquire(), rl.acquire(), rl.acquire(), rl.acquire(), rl.acquire()]);
    expect(clock.sleeps).toEqual([1001, 1001]);
  });

  it("既定の余裕（3秒）を加えて待つ", async () => {
    const clock = fakeClock();
    const rl = new RateLimiter({ maxRequests: 1, windowMs: 60_000, spread: false, now: clock.now, sleep: clock.sleep });
    await rl.acquire();
    await rl.acquire();
    expect(clock.sleeps).toEqual([63_000]);
  });
});

describe("RateLimiter（spread あり・既定）", () => {
  it("送信間隔を windowMs/max + margin に均等化する（5件/分 → 15秒間隔）", async () => {
    const clock = fakeClock();
    const rl = new RateLimiter({ maxRequests: 5, windowMs: 60_000, now: clock.now, sleep: clock.sleep });
    await rl.acquire();
    await rl.acquire();
    await rl.acquire();
    expect(clock.sleeps).toEqual([15_000, 15_000]);
    expect(clock.now()).toBe(30_000);
  });

  it("penalize 後はウィンドウ経過まで待つ", async () => {
    const clock = fakeClock();
    const rl = new RateLimiter({ maxRequests: 5, windowMs: 60_000, now: clock.now, sleep: clock.sleep });
    await rl.acquire();
    rl.penalize();
    expect(rl.inFlight).toBe(5);
    await rl.acquire();
    // 均等化の待ち（15秒）＋ウィンドウ残り（60秒＋余裕3秒 − 15秒）で、合計 63 秒後に送信できる
    expect(clock.now()).toBe(63_000);
  });
});

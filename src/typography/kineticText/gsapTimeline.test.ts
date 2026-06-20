// GSAP最小確認（判断5補足の実証）。
// インスタンス分割文字制御（Issue #21）は、GSAPの一時停止タイムラインを素のオブジェクトへ
// 補間させ、毎フレーム再生位置へ移動（シーク）して値を取り出す方式に依存する。
// この方式が、画面描画のないテスト環境（node）で成立することを最小の形で確かめる。
// ここで確認するのは「一時停止タイムラインが自走せず、時刻を与えたときだけ補間値を返し、
// 範囲外の時刻では端の値に留まる（クランプする）」ことである。
// これが成立しない場合、glyphAnimation はタイムライン生成口を擬似に差し替えた論理検証に限定し、
// 補間そのものの確認は実ブラウザの受け入れ診断へ委ねる方針へ切り替える。

import { describe, it, expect } from "vitest";
import gsap from "gsap";

describe("GSAPの一時停止タイムラインがテスト環境で補間とクランプを行う", () => {
  it("時刻を与えたときだけ素のオブジェクトを補間し、範囲外は端の値に留まる", () => {
    const state = { value: 0 };
    const timeline = gsap.timeline({ paused: true });
    // 区間の長さは秒で与える。GSAPの時間単位は秒のため、ミリ秒の値を1000で割って渡す。
    timeline.to(state, { value: 10, duration: 1, ease: "none" });

    // 先頭（時刻0秒）では先頭値。
    timeline.time(0);
    expect(state.value).toBe(0);

    // 中間（時刻0.5秒、等速）では中点の値。
    timeline.time(0.5);
    expect(state.value).toBeCloseTo(5, 6);

    // 末尾（時刻1秒）では末尾値。
    timeline.time(1);
    expect(state.value).toBeCloseTo(10, 6);

    // 範囲外（時刻5秒）では末尾値に留まる（クランプ）。
    timeline.time(5);
    expect(state.value).toBeCloseTo(10, 6);

    timeline.kill();
  });
});

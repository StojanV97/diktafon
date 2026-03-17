import { renderHook, act } from "@testing-library/react-native"
import useAutoSave from "../useAutoSave"

jest.useFakeTimers()

describe("useAutoSave", () => {
  test("calls saveFn after delay ms of inactivity", () => {
    const saveFn = jest.fn()
    const { result } = renderHook(() => useAutoSave(saveFn, 500))

    act(() => result.current.init("original"))
    act(() => result.current.handleTextChange("hello"))

    expect(saveFn).not.toHaveBeenCalled()
    act(() => jest.advanceTimersByTime(500))
    expect(saveFn).toHaveBeenCalledWith("hello")
  })

  test("resets timer on rapid changes — only last triggers save", () => {
    const saveFn = jest.fn()
    const { result } = renderHook(() => useAutoSave(saveFn, 500))

    act(() => result.current.init("original"))
    act(() => result.current.handleTextChange("a"))
    act(() => jest.advanceTimersByTime(200))
    act(() => result.current.handleTextChange("ab"))
    act(() => jest.advanceTimersByTime(200))
    act(() => result.current.handleTextChange("abc"))
    act(() => jest.advanceTimersByTime(500))

    expect(saveFn).toHaveBeenCalledTimes(1)
    expect(saveFn).toHaveBeenCalledWith("abc")
  })

  test("does not call saveFn if text is empty", () => {
    const saveFn = jest.fn()
    const { result } = renderHook(() => useAutoSave(saveFn, 500))

    act(() => result.current.init("original"))
    act(() => result.current.handleTextChange(""))
    act(() => jest.advanceTimersByTime(500))

    expect(saveFn).not.toHaveBeenCalled()
  })

  test("does not call saveFn if text is whitespace-only", () => {
    const saveFn = jest.fn()
    const { result } = renderHook(() => useAutoSave(saveFn, 500))

    act(() => result.current.init("original"))
    act(() => result.current.handleTextChange("   "))
    act(() => jest.advanceTimersByTime(500))

    expect(saveFn).not.toHaveBeenCalled()
  })

  test("flush() calls saveFn immediately and clears timer", () => {
    const saveFn = jest.fn()
    const { result } = renderHook(() => useAutoSave(saveFn, 500))

    act(() => result.current.init("original"))
    act(() => result.current.handleTextChange("urgent"))
    act(() => result.current.flush())

    expect(saveFn).toHaveBeenCalledWith("urgent")

    // Timer should be cleared — no duplicate call
    act(() => jest.advanceTimersByTime(500))
    expect(saveFn).toHaveBeenCalledTimes(1)
  })

  test("cleanup on unmount clears pending timer", () => {
    const saveFn = jest.fn()
    const { result, unmount } = renderHook(() => useAutoSave(saveFn, 500))

    act(() => result.current.init("original"))
    act(() => result.current.handleTextChange("pending"))
    unmount()
    act(() => jest.advanceTimersByTime(500))

    expect(saveFn).not.toHaveBeenCalled()
  })
})

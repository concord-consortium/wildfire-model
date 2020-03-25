import { getEventHandlers, InteractionHandler } from "./interaction-handler";
import { PointerEvent } from "react-three-fiber/canvas";

describe("getEventHandlers", () => {
  it("should handle all available event types", () => {
    const interaction: InteractionHandler = {
      active: true,
      onClick: jest.fn(),
      onPointerDown: jest.fn(),
      onPointerUp: jest.fn(),
      onPointerMove: jest.fn(),
      onPointerOver: jest.fn(),
      onPointerOut: jest.fn(),
      onPointerEnter: jest.fn(),
      onPointerLeave: jest.fn(),
      onWheel: jest.fn()
    };
    const handlers = getEventHandlers([interaction]);
    expect(handlers.onClick).toBeDefined();
    expect(handlers.onPointerDown).toBeDefined();
    expect(handlers.onPointerUp).toBeDefined();
    expect(handlers.onPointerMove).toBeDefined();
    expect(handlers.onPointerOver).toBeDefined();
    expect(handlers.onPointerOut).toBeDefined();
    expect(handlers.onPointerEnter).toBeDefined();
    expect(handlers.onPointerLeave).toBeDefined();
    expect(handlers.onWheel).toBeDefined();
  });

  it("should return object with event handlers of active interactions only", () => {
    const interaction1: InteractionHandler = {
      active: false,
      onClick: jest.fn()
    };
    const interaction2: InteractionHandler = {
      active: true,
      onPointerDown: jest.fn()
    };
    const interaction3: InteractionHandler = {
      active: true,
      onPointerDown: jest.fn()
    };

    const handlers = getEventHandlers([interaction1, interaction2, interaction3]);
    // This should be undefined (and NOT function that does nothing), as it helps to avoid adding unnecessary
    // event handlers that cause significant performance drop (raycasting).
    expect(handlers.onClick).toBeUndefined();
    expect(handlers.onPointerDown).toBeDefined();
    const event = {} as PointerEvent;
    handlers.onPointerDown!(event);
    expect(interaction2.onPointerDown).toHaveBeenCalledWith(event);
    expect(interaction3.onPointerDown).toHaveBeenCalledWith(event);
  });
});

import "@testing-library/jest-dom";
import { configure } from "mobx";

// Disable mobx strict mode. Make v6 compatible with v4/v5 that was not enforcing strict mode by default.
configure({ enforceActions: "never", safeDescriptors: false });

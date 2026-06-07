import { describe, expect, it, vi } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import { DataTable, type Column } from "../../src/components/DataTable";

interface Row {
  id: string;
}
const rows: Row[] = [{ id: "a" }, { id: "b" }];
const columns: Column<Row>[] = [{ header: "ID", cell: (r) => r.id }];

// jsdom does no layout, so the scroll metrics are stubbed onto the scroll container directly.
function setScroll(el: HTMLElement, { scrollTop, clientHeight, scrollHeight }: { scrollTop: number; clientHeight: number; scrollHeight: number }) {
  Object.defineProperty(el, "scrollTop", { value: scrollTop, configurable: true });
  Object.defineProperty(el, "clientHeight", { value: clientHeight, configurable: true });
  Object.defineProperty(el, "scrollHeight", { value: scrollHeight, configurable: true });
}

function renderTable(onEndReached?: () => void) {
  const { container } = render(
    <DataTable
      columns={columns}
      rows={rows}
      rowKey={(r) => r.id}
      selectedKey={null}
      onSelect={() => {}}
      emptyLabel="none"
      onEndReached={onEndReached}
    />,
  );
  return container.querySelector(".overflow-y-auto") as HTMLElement;
}

describe("DataTable onEndReached", () => {
  it("fires onEndReached when scrolled near the bottom", () => {
    const onEndReached = vi.fn();
    const scroller = renderTable(onEndReached);
    setScroll(scroller, { scrollTop: 400, clientHeight: 500, scrollHeight: 1000 }); // 100px from bottom
    fireEvent.scroll(scroller);
    expect(onEndReached).toHaveBeenCalledTimes(1);
  });

  it("does not fire onEndReached when far from the bottom", () => {
    const onEndReached = vi.fn();
    const scroller = renderTable(onEndReached);
    setScroll(scroller, { scrollTop: 0, clientHeight: 500, scrollHeight: 1000 }); // 500px from bottom
    fireEvent.scroll(scroller);
    expect(onEndReached).not.toHaveBeenCalled();
  });
});

import { describe, expect, it, vi, afterEach, beforeEach } from "vitest";
import { render, fireEvent, screen } from "@testing-library/react";
import { DataTable, type Column } from "../../src/components/DataTable";
import { stubVirtualLayout } from "../virtual-layout";

it("keeps a stable column's default sort and focused button when its label changes", () => {
  const data = [{ id: "a" }, { id: "b" }];
  const translatedColumns = (header: string): Column<Row>[] => [{ id: "identity", header, cell: (r) => r.id, sortValue: (r) => r.id }];
  const view = (header: string) => <DataTable columns={translatedColumns(header)} rows={data} rowKey={(r) => r.id} selectedKey={null} onSelect={() => {}} emptyLabel="none" defaultSort={{ id: "identity", direction: "desc" }} />;
  const { container, rerender } = render(view("ID"));
  const order = () => [...container.querySelectorAll("tbody tr")].map((r) => r.textContent);
  expect(order()).toEqual(["b", "a"]);
  const button = screen.getByRole("button", { name: /^ID\s*▼$/ });
  button.focus();
  rerender(view("Identifiant"));
  expect(order()).toEqual(["b", "a"]);
  expect(screen.getByRole("button", { name: /^Identifiant\s*▼$/ })).toBe(button);
  expect(button).toHaveFocus();
  fireEvent.click(button);
  expect(order()).toEqual(["a", "b"]);
});

it("retains header-based default and user sorting for callers without column IDs", () => {
  const { container } = render(<DataTable columns={[{ header: "ID", cell: (r: Row) => r.id, sortValue: (r) => r.id }]} rows={rows} rowKey={(r) => r.id} selectedKey={null} onSelect={() => {}} emptyLabel="none" defaultSort={{ header: "ID", direction: "desc" }} />);
  const order = () => [...container.querySelectorAll("tbody tr")].map((r) => r.textContent);
  expect(order()).toEqual(["b", "a"]);
  fireEvent.click(screen.getByRole("button", { name: /^ID\s*▼$/ }));
  expect(order()).toEqual(["a", "b"]);
});

it("sorts text with numeric runs in number order and empties last", () => {
  const data = [{ id: "Node 10" }, { id: "" }, { id: "node 9" }, { id: "Node 1" }];
  const { container } = render(<DataTable columns={[{ id: "name", header: "Name", cell: (r: Row) => r.id, sortValue: (r) => r.id }]} rows={data} rowKey={(r) => r.id} selectedKey={null} onSelect={() => {}} emptyLabel="none" defaultSort={{ id: "name" }} />);
  const order = () => [...container.querySelectorAll("tbody tr")].map((r) => r.textContent);
  expect(order()).toEqual(["Node 1", "node 9", "Node 10", ""]);
  fireEvent.click(screen.getByRole("button", { name: /^Name/ }));
  expect(order()).toEqual(["Node 10", "node 9", "Node 1", ""]);
});

it("keeps rows sorted as pages append and live updates replace rows, and after a re-sort", () => {
  type Named = { id: string; name: string };
  const cols: Column<Named>[] = [{ id: "name", header: "Name", cell: (r) => r.name, sortValue: (r) => r.name }];
  const view = (data: Named[]) => <DataTable columns={cols} rows={data} rowKey={(r) => r.id} selectedKey={null} onSelect={() => {}} emptyLabel="none" defaultSort={{ id: "name" }} />;
  const page1 = [{ id: "1", name: "delta" }, { id: "2", name: "alpha" }];
  const { container, rerender } = render(view(page1));
  const order = () => [...container.querySelectorAll("tbody tr")].map((r) => r.textContent);
  expect(order()).toEqual(["alpha", "delta"]);
  const page2 = [...page1, { id: "3", name: "charlie" }, { id: "4", name: "bravo" }];
  rerender(view(page2));
  expect(order()).toEqual(["alpha", "bravo", "charlie", "delta"]);
  const patched = page2.map((r) => (r.id === "2" ? { ...r, name: "echo" } : r));
  rerender(view(patched));
  expect(order()).toEqual(["bravo", "charlie", "delta", "echo"]);
  fireEvent.click(screen.getByRole("button", { name: /^Name/ }));
  expect(order()).toEqual(["echo", "delta", "charlie", "bravo"]);
  rerender(view([...patched, { id: "5", name: "able" }]));
  expect(order()).toEqual(["echo", "delta", "charlie", "bravo", "able"]);
});

interface Row {
  id: string;
}
const rows: Row[] = [{ id: "a" }, { id: "b" }];
const columns: Column<Row>[] = [{ header: "ID", cell: (r) => r.id }];

// Force the mobile media query to match so DataTable enters card mode.
function setMobile(matches: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia;
}

afterEach(() => {
  vi.restoreAllMocks();
});

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

describe("DataTable virtualization", () => {
  const VIEWPORT_H = 500;
  const ROW_H = 38;
  const many = Array.from({ length: 1000 }, (_, i) => ({ id: `n${String(i).padStart(4, "0")}` }));

  beforeEach(() => {
    stubVirtualLayout(VIEWPORT_H, ROW_H);
  });

  function renderMany(mobile: boolean, virtualize = true) {
    setMobile(mobile);
    return render(
      <DataTable
        columns={columns}
        rows={many}
        rowKey={(r) => r.id}
        selectedKey={null}
        onSelect={() => {}}
        emptyLabel="none"
        renderCard={(r) => <span>card-{r.id}</span>}
        virtualize={virtualize}
      />,
    ).container;
  }

  it("renders every row unless asked to virtualize", () => {
    expect(renderMany(false, false).querySelectorAll("tbody tr")).toHaveLength(many.length);
  });

  it("pins column widths so they don't follow the mounted rows", () => {
    setMobile(false);
    const pinned: Column<Row>[] = [{ header: "ID", cell: (r) => r.id, width: "16rem" }, { header: "Other", cell: () => "" }];
    const { container } = render(<DataTable columns={pinned} rows={many} rowKey={(r) => r.id} selectedKey={null} onSelect={() => {}} emptyLabel="none" virtualize minWidth="40rem" />);
    const table = container.querySelector("table")!;
    expect(table).toHaveClass("table-fixed");
    expect(table.style.minWidth).toBe("40rem");
    expect([...table.querySelectorAll("colgroup col")].map((col) => (col as HTMLElement).style.width)).toEqual(["16rem", ""]);
  });

  it("renders only the rows near the viewport", () => {
    const container = renderMany(false);
    const rendered = container.querySelectorAll("tbody tr[data-index]");
    expect(rendered.length).toBeGreaterThan(VIEWPORT_H / ROW_H);
    expect(rendered.length).toBeLessThan(50);
    expect(rendered[0].textContent).toBe("n0000");
  });

  it("keeps the scroll height of the whole list", () => {
    const container = renderMany(false);
    const rendered = container.querySelectorAll("tbody tr[data-index]").length;
    const spacer = container.querySelector("tbody tr:last-child td") as HTMLElement;
    expect(parseFloat(spacer.style.height)).toBe((many.length - rendered) * ROW_H);
  });

  it("renders only the cards near the viewport", () => {
    const container = renderMany(true);
    const rendered = container.querySelectorAll("button");
    expect(rendered.length).toBeGreaterThan(VIEWPORT_H / ROW_H);
    expect(rendered.length).toBeLessThan(50);
    expect(rendered[0].textContent).toBe("card-n0000");
  });

  it("gives every card but the list's last a divider, wherever the mounted window ends", () => {
    const cards = [...renderMany(true).querySelectorAll("button")];
    expect(cards.every((card) => card.classList.contains("border-b"))).toBe(true);
    const few = render(<DataTable columns={columns} rows={rows} rowKey={(r) => r.id} selectedKey={null} onSelect={() => {}} emptyLabel="none" renderCard={(r) => r.id} virtualize />).container;
    expect([...few.querySelectorAll("button")].map((card) => card.classList.contains("border-b"))).toEqual([true, false]);
  });

  it("tells assistive tech the full row count, not just the mounted rows", () => {
    const table = renderMany(false).querySelector("table")!;
    expect(table).toHaveAttribute("aria-rowcount", String(many.length + 1));
    expect(table.querySelector("thead tr")).toHaveAttribute("aria-rowindex", "1");
    expect(table.querySelector("tbody tr[data-index='0']")).toHaveAttribute("aria-rowindex", "2");
  });

  it("leaves row counts to the DOM when every row is mounted", () => {
    expect(renderMany(false, false).querySelector("table")).not.toHaveAttribute("aria-rowcount");
  });
});

describe("DataTable card mode", () => {
  it("renders cards instead of a table when mobile and renderCard is provided", () => {
    setMobile(true);
    const { container } = render(
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(r) => r.id}
        selectedKey={null}
        onSelect={() => {}}
        emptyLabel="none"
        renderCard={(r) => <span>card-{r.id}</span>}
      />,
    );
    expect(container.querySelector("table")).toBeNull();
    expect(screen.getByText("card-a")).toBeInTheDocument();
    expect(screen.getByText("card-b")).toBeInTheDocument();
  });

  it("still renders a table on desktop even with renderCard provided", () => {
    setMobile(false);
    const { container } = render(
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(r) => r.id}
        selectedKey={null}
        onSelect={() => {}}
        emptyLabel="none"
        renderCard={(r) => <span>card-{r.id}</span>}
      />,
    );
    expect(container.querySelector("table")).not.toBeNull();
    expect(screen.queryByText("card-a")).toBeNull();
  });

  it("selects a card on click in card mode", () => {
    setMobile(true);
    const onSelect = vi.fn();
    render(
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(r) => r.id}
        selectedKey={null}
        onSelect={onSelect}
        emptyLabel="none"
        renderCard={(r) => <span>card-{r.id}</span>}
      />,
    );
    fireEvent.click(screen.getByText("card-a"));
    expect(onSelect).toHaveBeenCalledWith("a");
  });

  it("still fires onEndReached in card mode", () => {
    setMobile(true);
    const onEndReached = vi.fn();
    const { container } = render(
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(r) => r.id}
        selectedKey={null}
        onSelect={() => {}}
        emptyLabel="none"
        onEndReached={onEndReached}
        renderCard={(r) => <span>card-{r.id}</span>}
      />,
    );
    const scroller = container.querySelector(".overflow-y-auto") as HTMLElement;
    setScroll(scroller, { scrollTop: 400, clientHeight: 500, scrollHeight: 1000 });
    fireEvent.scroll(scroller);
    expect(onEndReached).toHaveBeenCalledTimes(1);
  });
});

describe("DataTable controlled sort", () => {
  const cols: Column<Row>[] = [{ id: "id", header: "ID", cell: (r) => r.id, sortValue: (r) => r.id }];

  it("shows presorted rows as given and asks the caller for the next order", () => {
    const onSortChange = vi.fn();
    const view = (sort: { id: string; direction: "asc" | "desc" }) => (
      <DataTable columns={cols} rows={[{ id: "b" }, { id: "a" }]} rowKey={(r) => r.id} selectedKey={null} onSelect={() => {}} emptyLabel="none" sort={sort} onSortChange={onSortChange} presorted />
    );
    const { container, rerender } = render(view({ id: "id", direction: "asc" }));
    const order = () => [...container.querySelectorAll("tbody tr")].map((r) => r.textContent);
    expect(order()).toEqual(["b", "a"]);
    fireEvent.click(screen.getByRole("button", { name: /^ID\s*▲$/ }));
    expect(onSortChange).toHaveBeenLastCalledWith({ id: "id", direction: "desc" });
    expect(order()).toEqual(["b", "a"]); // nothing moves until the caller's rows do
    rerender(view({ id: "id", direction: "desc" }));
    expect(screen.getByRole("button", { name: /^ID\s*▼$/ })).toBeInTheDocument();
  });

  it("sorts rows itself under a controlled sort that isn't presorted", () => {
    const { container } = render(
      <DataTable columns={cols} rows={[{ id: "a" }, { id: "b" }]} rowKey={(r) => r.id} selectedKey={null} onSelect={() => {}} emptyLabel="none" sort={{ id: "id", direction: "desc" }} onSortChange={() => {}} />,
    );
    expect([...container.querySelectorAll("tbody tr")].map((r) => r.textContent)).toEqual(["b", "a"]);
  });

  it("goes back to the top when a presorted table's order changes", () => {
    const view = (direction: "asc" | "desc") => (
      <DataTable columns={cols} rows={[{ id: "a" }]} rowKey={(r) => r.id} selectedKey={null} onSelect={() => {}} emptyLabel="none" sort={{ id: "id", direction }} onSortChange={() => {}} presorted />
    );
    const { container, rerender } = render(view("asc"));
    const scroller = container.firstElementChild as HTMLElement;
    scroller.scrollTop = 120;
    rerender(view("desc"));
    expect(scroller.scrollTop).toBe(0);
  });
});

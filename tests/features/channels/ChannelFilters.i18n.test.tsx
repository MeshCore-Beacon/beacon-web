import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ChannelSidebar } from "../../../src/features/channels/ChannelSidebar";
import { ChannelFilterBar } from "../../../src/features/channels/ChannelFilterBar";
import type { ChannelSummary } from "../../../src/features/channels/types";
import i18n from "../../../src/i18n";

const channels: ChannelSummary[] = [
  { id: 1, name: "Public", channelHash: "11", lastSeen: 2, isHashtag: false, keyKnown: true },
  { id: 2, name: "#ops", channelHash: "22", lastSeen: 1, isHashtag: true, keyKnown: false },
];

function mount() {
  render(<>
    <ChannelFilterBar search="" onSearchChange={() => {}} searchField="name" onSearchFieldChange={() => {}}
      keyFilter="" onKeyChange={() => {}} hashtagFilter="" onHashtagChange={() => {}} />
    <ChannelSidebar channels={channels} selectedId={null} onSelect={() => {}} />
  </>);
}

describe("channel list chrome", () => {
  it("renders in English", () => {
    mount();
    expect(screen.getByRole("toolbar", { name: "Channel filters" })).toBeInTheDocument();
    expect(screen.getByText("key")).toBeInTheDocument();
    expect(screen.getByText("no key")).toBeInTheDocument();
  });

  it("renders in French", async () => {
    await i18n.changeLanguage("fr");
    mount();
    expect(screen.getByRole("toolbar", { name: "Filtres des canaux" })).toBeInTheDocument();
    expect(screen.getByText("clé")).toBeInTheDocument();
    expect(screen.getByText("sans clé")).toBeInTheDocument();
    expect(screen.getByText("mot-dièse")).toBeInTheDocument();
  });
});

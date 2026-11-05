import { QueryClient,QueryClientProvider } from "@tanstack/react-query";
import { render,screen,fireEvent,within } from "@testing-library/react";
import { beforeEach,it,expect,vi } from "vitest";
import { ScopeActivityPanel,ObserverScopeActivity } from "../../../src/features/scopes/ScopeActivityPanel";
import { getScopeActivity } from "../../../src/api/client";
import type { ScopeActivity } from "../../../src/features/scopes/types";

vi.mock("../../../src/api/client",()=>({getScopeActivity:vi.fn()}));
vi.mock("../../../src/hooks/useRegion",()=>({useRegion:()=>({iatas:["YKF"],regionKey:"YKF",isResolved:true})}));
const now=Date.now(),hour=Math.floor(now/3_600_000)*3_600_000;
const fixture:ScopeActivity={since:hour-23*3_600_000,until:now,firstSeen:now-1000,lastSeen:now,truncated:false,
  scopes:[{name:"#ykf",receiverReports:10,uniqueSamples:3,repeatReports:25,activeRepeaters:4,receivingObservers:2,unresolvedHops:1,ambiguousHops:2,hourly:[{hour,receiverReports:10,uniqueSamples:3,repeatReports:25}]},{name:"*",receiverReports:10,uniqueSamples:5,repeatReports:20,activeRepeaters:3,receivingObservers:1,unresolvedHops:0,ambiguousHops:0,hourly:[]}],
  countries:[{country:"CA",scope:"#ykf",reports:10,uniqueSamples:3,observers:2}],
  observers:[{observerId:"a",name:"Receiver A",iata:"YKF",country:"CA",scope:"#ykf",reports:8,lastSeen:now},{observerId:"b",name:"Receiver B",iata:"YKF",country:"CA",scope:"#ykf",reports:2,lastSeen:now}]};
beforeEach(()=>{vi.clearAllMocks();vi.mocked(getScopeActivity).mockResolvedValue(fixture);});
function show(element:React.ReactNode){const client=new QueryClient({defaultOptions:{queries:{retry:false}}});return render(<QueryClientProvider client={client}>{element}</QueryClientProvider>);}
it("keeps reception share based on all traffic when searching and does not invent missing country traffic",async()=>{
  show(<ScopeActivityPanel/>);const table=await screen.findByRole("table",{name:"Scope evidence counts"});
  fireEvent.change(screen.getByRole("searchbox",{name:"Scope"}),{target:{value:"ykf"}});
  const row=within(table).getByRole("row",{name:/#ykf/});expect(within(row).getByText("50.0")).toBeInTheDocument();expect(within(row).getByText("3")).toBeInTheDocument();
  fireEvent.click(screen.getByText("Receiving areas by country"));const countries=screen.getByRole("table",{name:"Receiving areas by country"});
  expect(within(countries).getByRole("row",{name:/US.*No scope evidence/})).toBeInTheDocument();
  expect(screen.getByRole("img",{name:"Hourly scope activity"}).querySelector('[stroke-dasharray]')).not.toBeNull();
});
it("loads observer evidence only after expansion and excludes other observers",async()=>{
  show(<ObserverScopeActivity observerId="a"/>);expect(getScopeActivity).not.toHaveBeenCalled();
  fireEvent.click(screen.getByText("Scope activity"));const table=await screen.findByRole("table",{name:"Scope activity"});
  expect(within(table).getByText("8")).toBeInTheDocument();expect(within(table).queryByText("2")).not.toBeInTheDocument();
});

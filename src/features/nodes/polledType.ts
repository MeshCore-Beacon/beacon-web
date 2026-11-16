// Repeaters and room servers are the node types the server polls for readings.
const POLLED_TYPES = ["repeater", "room_server"];

export const isPolledNodeType = (name: string | undefined): boolean => !!name && POLLED_TYPES.includes(name.toLowerCase());

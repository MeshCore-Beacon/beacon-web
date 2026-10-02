// excludes the nil UUID, which the API uses as a placeholder rather than a real observer id
export const OBSERVER_UUID = /^(?!00000000-0000-0000-0000-000000000000$)[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i;

import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useLocation } from 'react-router-dom';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { AccountViews } from '../../../src/features/account/AccountViews';
import { RequestTelemetry } from '../../../src/features/nodes/RequestTelemetry';
import { auth, me, requests } from '../../../src/api/auth';
import { clearSession, setSessionUser, startSession } from '../../../src/hooks/useSession';
import { authError, mocks, renderAt, resetMocks, searchOf, user } from './helpers';
vi.mock('../../../src/api/auth', async (orig) => ({ ...await orig<typeof import('../../../src/api/auth')>(),
  auth: { login: vi.fn(), logout: vi.fn(), verify: vi.fn(), appCode: vi.fn(), register: vi.fn(), confirmReset: vi.fn() },
  me: { get: vi.fn(), setDisplayName: vi.fn(), sessions: vi.fn(), changePassword: vi.fn(), changeEmail: vi.fn(), deleteAccount: vi.fn() },
  requests: { list: vi.fn(), create: vi.fn(), update: vi.fn() },
}));
vi.mock('../../../src/hooks/useFeatures', () => ({ useFeatures: () => mocks.features, useFeaturesLoading: () => false, useDisplayUnits: () => ({ temperature: 'c', distance: 'metric' }) }));
const device = { id: 's1', kind: 'web' as const, label: 'A private laptop', current: true, createdAt: 1, lastUsedAt: 1, expiresAt: 9999999999999 };
const defer = <T,>() => { let resolve!: (v:T)=>void; let reject!: (v:unknown)=>void; const promise = new Promise<T>((a,b)=>{resolve=a;reject=b;}); return {promise,resolve,reject}; };
beforeEach(() => { resetMocks(); vi.mocked(me.get).mockResolvedValue({user}); vi.mocked(me.sessions).mockResolvedValue({sessions:[device]}); });
afterEach(() => vi.clearAllMocks());
it('does not restore A when a display-name request finishes after logout', async () => {
 const pending=defer<{user: typeof user}>(); vi.mocked(me.setDisplayName).mockReturnValue(pending.promise);
 const {client}=renderAt('?view=profile', <AccountViews/>);
 await screen.findByRole('heading',{name:'Profile'});
 fireEvent.change(screen.getByLabelText('Display name'),{target:{value:'Edited A'}});
 fireEvent.click(screen.getByRole('button',{name:'Save'}));
 await waitFor(()=>expect(me.setDisplayName).toHaveBeenCalled());
 act(()=>clearSession(client));
 await screen.findByRole('heading',{name:'Sign in'});
 await act(async()=>pending.resolve({user:{...user,displayName:'Edited A'}}));
 expect(client.getQueryData(['me'])).toBeNull();
});
it('does not clear B when an old A mutation returns not_signed_in', async () => {
 const pending=defer<{user: typeof user}>(); vi.mocked(me.setDisplayName).mockReturnValue(pending.promise);
 const {client}=renderAt('?view=profile', <AccountViews/>);
 await screen.findByRole('heading',{name:'Profile'});
 fireEvent.change(screen.getByLabelText('Display name'),{target:{value:'Edited A'}});
 fireEvent.click(screen.getByRole('button',{name:'Save'}));
 await waitFor(()=>expect(me.setDisplayName).toHaveBeenCalled());
 act(()=>clearSession(client)); await screen.findByRole('heading',{name:'Sign in'});
 const b={...user,id:'B',username:'userB'}; act(()=>setSessionUser(client,b));
 await screen.findByText('@userB');
 await act(async()=>pending.reject(authError('not_signed_in',401)));
 expect(client.getQueryData(['me'])).toEqual(b);
});
it('wipes A device data when a refetched session discovers account B', async () => {
 const {client}=renderAt('?view=profile', <AccountViews/>);
 await screen.findByText('A private laptop');
 const pending=defer<{sessions: typeof device[]}>(); vi.mocked(me.sessions).mockReturnValue(pending.promise);
 vi.mocked(me.get).mockResolvedValue({user:{...user,id:'B',username:'userB'}});
 await act(async()=>{await client.refetchQueries({queryKey:['me'],exact:true});});
 await screen.findByText('@userB');
 expect(screen.queryByText('A private laptop')).not.toBeInTheDocument();
});
it('does not retain a guest password in the mutation cache after logout', async () => {
 mocks.features.telemetryRequests=true;
 vi.mocked(requests.list).mockResolvedValue({requests:[],limit:3});
 vi.mocked(requests.create).mockResolvedValue({} as never);
 const {client,unmount}=renderAt('', <RequestTelemetry node={{id:'n',publicKey:'aa'}}/>);
 const input=await screen.findByLabelText(/Guest password/i);
 fireEvent.change(input,{target:{value:'private-radio'}});
 fireEvent.submit(input.closest('form')!);
 await waitFor(()=>expect(requests.create).toHaveBeenCalled());
 await new Promise(r=>setTimeout(r,20));
 act(()=>clearSession(client)); unmount();
 expect(client.getMutationCache().getAll().map(m=>m.state.variables)).not.toContain('private-radio');
});
it('does not reopen verify after the user leaves while verification is pending', async()=>{
 const pending=defer<{status:'verified'}>(); vi.mocked(auth.verify).mockReturnValue(pending.promise);
 renderAt('?tab=Map&view=verify&token=abc', <AccountViews/>);
 await waitFor(()=>expect(auth.verify).toHaveBeenCalled());
 fireEvent.click(screen.getByRole('button',{name:"Close"}));
 expect(searchOf(screen.getByTestId('search')).has('view')).toBe(false);
 await act(async()=>pending.resolve({status:'verified'}));
 expect(searchOf(screen.getByTestId('search')).has('view')).toBe(false);
});
it('does not retain the account password via cached mutation callback after sign-in and logout', async()=>{
 vi.mocked(me.get).mockRejectedValue(authError('not_signed_in',401));
 vi.mocked(auth.login).mockResolvedValue({user});
 const {client,unmount}=renderAt('?view=signin', <AccountViews/>);
 const pw=await screen.findByLabelText('Password');
 fireEvent.change(screen.getByLabelText(/Username or email/),{target:{value:'ridge'}});
 fireEvent.change(pw,{target:{value:'secret-account-passphrase'}});
 fireEvent.submit(pw.closest('form')!);
 await waitFor(()=>expect(searchOf(screen.getByTestId('search')).has('view')).toBe(false));
 act(()=>clearSession(client)); unmount();
 const cached=client.getMutationCache().getAll();
 vi.mocked(auth.login).mockClear();
 // Demonstrate the cached options still close over the secret, without using a real network.
 for (const m of cached) await m.options.mutationFn?.(undefined, {} as never);
 expect(vi.mocked(auth.login).mock.calls.flat()).not.toContain('secret-account-passphrase');
});
it('does not carry A entered password into B profile on session refresh', async()=>{
 const {client}=renderAt('?view=profile', <AccountViews/>);
 await screen.findByRole('heading',{name:'Profile'});
 const current=within(screen.getByRole('region',{name:'Password'})).getByLabelText('Current password');
 fireEvent.change(current,{target:{value:'A-secret-passphrase'}});
 vi.mocked(me.get).mockResolvedValue({user:{...user,id:'B',username:'userB'}});
 await act(async()=>{await client.refetchQueries({queryKey:['me'],exact:true});});
 await screen.findByText('@userB');
 expect(within(screen.getByRole('region',{name:'Password'})).getByLabelText('Current password')).toHaveValue('');
});

// Every retained mutation: no secret in its variables, and replaying its function sends none.
async function expectNoSecret(client: import('@tanstack/react-query').QueryClient, secret: string, calls: Array<ReturnType<typeof vi.fn>>) {
 const all = client.getMutationCache().getAll();
 expect(JSON.stringify(all.map(m=>m.state.variables ?? null))).not.toContain(secret);
 for (const c of calls) c.mockClear();
 for (const m of all) { try { await m.options.mutationFn?.(undefined as never, {} as never); } catch { /* replay may fail */ } }
 expect(JSON.stringify(calls.flatMap(c=>c.mock.calls))).not.toContain(secret);
}
it('keeps the change-password secrets out of the mutation cache', async()=>{
 vi.mocked(me.changePassword).mockResolvedValue(undefined);
 const {client}=renderAt('?view=profile', <AccountViews/>);
 await screen.findByRole('heading',{name:'Profile'});
 const region=within(screen.getByRole('region',{name:'Password'}));
 fireEvent.change(region.getByLabelText('Current password'),{target:{value:'old-secret-pw'}});
 fireEvent.change(region.getByLabelText('New password'),{target:{value:'new-secret-pw'}});
 fireEvent.submit(region.getByLabelText('Current password').closest('form')!);
 await waitFor(()=>expect(me.changePassword).toHaveBeenCalledWith('old-secret-pw','new-secret-pw'));
 await screen.findByText(/Password changed/);
 await expectNoSecret(client,'old-secret-pw',[vi.mocked(me.changePassword)]);
 await expectNoSecret(client,'new-secret-pw',[vi.mocked(me.changePassword)]);
});
it('keeps the delete-account password out of the mutation cache', async()=>{
 vi.mocked(me.deleteAccount).mockRejectedValue(authError('invalid_credentials',403));
 const {client}=renderAt('?view=profile', <AccountViews/>);
 await screen.findByRole('heading',{name:'Profile'});
 const pw=screen.getByLabelText('Current password',{selector:'input[name=deletePassword]'});
 fireEvent.change(pw,{target:{value:'del-secret-pw'}});
 fireEvent.click(screen.getByRole('button',{name:'Delete account'}));
 fireEvent.change(await screen.findByLabelText(/Type/),{target:{value:user.username}});
 fireEvent.submit(pw.closest('form')!);
 await waitFor(()=>expect(me.deleteAccount).toHaveBeenCalled());
 await expectNoSecret(client,'del-secret-pw',[vi.mocked(me.deleteAccount)]);
});
it('keeps the register and reset secrets out of the mutation cache', async()=>{
 vi.mocked(auth.register).mockResolvedValue({status:'check_email'} as never);
 const a=renderAt('?view=register', <AccountViews/>);
 fireEvent.change(await screen.findByLabelText(/^Username/),{target:{value:'newbie'}});
 fireEvent.change(screen.getByLabelText('Email'),{target:{value:'n@example.org'}});
 const pw=screen.getByLabelText('Password');
 fireEvent.change(pw,{target:{value:'reg-secret-pw'}});
 fireEvent.submit(pw.closest('form')!);
 await waitFor(()=>expect(auth.register).toHaveBeenCalled());
 await expectNoSecret(a.client,'reg-secret-pw',[vi.mocked(auth.register)]);
 a.unmount();
 vi.mocked(auth.confirmReset).mockResolvedValue({status:'password_set'} as never);
 const b=renderAt('?view=reset#token=rt1', <AccountViews/>);
 const np=await screen.findByLabelText('New password');
 fireEvent.change(np,{target:{value:'reset-secret-pw'}});
 fireEvent.submit(np.closest('form')!);
 await waitFor(()=>expect(auth.confirmReset).toHaveBeenCalled());
 await expectNoSecret(b.client,'reset-secret-pw',[vi.mocked(auth.confirmReset)]);
});
it('keeps the guest password (edit) out of the mutation cache', async()=>{
 mocks.features.telemetryRequests=true;
 const req={id:'r1',node:{id:'n1',publicKey:'aa',name:'Hill'},status:'pending',enabled:true,hasPassword:false};
 vi.mocked(requests.list).mockResolvedValue({requests:[req],limit:3} as never);
 vi.mocked(requests.update).mockResolvedValue({} as never);
 const {client}=renderAt('?view=profile', <AccountViews/>);
 fireEvent.click(await screen.findByRole('button',{name:/Change password for Hill/}));
 const input=await screen.findByLabelText('New guest password');
 fireEvent.change(input,{target:{value:'guest-edit-pw'}});
 fireEvent.submit(input.closest('form')!);
 await waitFor(()=>expect(requests.update).toHaveBeenCalled());
 await expectNoSecret(client,'guest-edit-pw',[vi.mocked(requests.update)]);
});
it('wipes private data and cancels the mutation cache on an identity change seen through /me, to null as well', async()=>{
 const {client}=renderAt('?view=profile', <AccountViews/>);
 await screen.findByText('A private laptop');
 vi.mocked(me.get).mockRejectedValue(authError('not_signed_in',401));
 await act(async()=>{await client.refetchQueries({queryKey:['me'],exact:true});});
 await screen.findByRole('heading',{name:'Sign in'});
 expect(client.getQueryCache().findAll({predicate:q=>q.queryKey[0]==='me'&&q.queryKey.length>1})).toHaveLength(0);
});
it('does not let a stale same-user mutation act after the user signed in again', async()=>{
 const pending=defer<{user: typeof user}>(); vi.mocked(me.setDisplayName).mockReturnValue(pending.promise);
 const {client}=renderAt('?view=profile', <AccountViews/>);
 await screen.findByRole('heading',{name:'Profile'});
 fireEvent.change(screen.getByLabelText('Display name'),{target:{value:'Edited A'}});
 fireEvent.click(screen.getByRole('button',{name:'Save'}));
 await waitFor(()=>expect(me.setDisplayName).toHaveBeenCalled());
 act(()=>clearSession(client)); await screen.findByRole('heading',{name:'Sign in'});
 act(()=>startSession(client,user)); await screen.findByRole('heading',{name:'Profile'});
 await act(async()=>pending.resolve({user:{...user,displayName:'Edited A'}}));
 expect((client.getQueryData(['me']) as typeof user).displayName).toBe(user.displayName);
});
const hashOf = () => screen.getByTestId('hash').textContent;
function HashProbe(){ return <output data-testid="hash">{useLocation().hash}</output>; }
it('reads the verify token from the fragment and removes it at once', async()=>{
 vi.mocked(auth.verify).mockResolvedValue({status:'verified'});
 renderAt('?tab=Map&view=verify#token=frag1', <><AccountViews/><HashProbe/></>);
 await waitFor(()=>expect(auth.verify).toHaveBeenCalledWith('frag1'));
 expect(hashOf()).toBe('');
 expect(searchOf(screen.getByTestId('search')).get('view')).toBe('verify');
});
it('still reads a verify token from the query and removes it', async()=>{
 vi.mocked(auth.verify).mockResolvedValue({status:'verified'});
 renderAt('?view=verify&token=q1', <><AccountViews/><HashProbe/></>);
 await waitFor(()=>expect(auth.verify).toHaveBeenCalledWith('q1'));
 expect(searchOf(screen.getByTestId('search')).has('token')).toBe(false);
});
it('removes the verify token before the request finishes', async()=>{
 vi.mocked(auth.verify).mockReturnValue(new Promise(()=>{}));
 renderAt('?view=verify#token=frag2', <><AccountViews/><HashProbe/></>);
 await waitFor(()=>expect(auth.verify).toHaveBeenCalled());
 expect(hashOf()).toBe('');
});
it('reads the reset token from the fragment and from the query', async()=>{
 const a=renderAt('?view=reset#token=rf', <><AccountViews/><HashProbe/></>);
 await screen.findByLabelText('New password');
 expect(hashOf()).toBe('');
 a.unmount();
 renderAt('?view=reset&token=rq', <><AccountViews/><HashProbe/></>);
 await screen.findByLabelText('New password');
 expect(searchOf(screen.getByTestId('search')).has('token')).toBe(false);
});

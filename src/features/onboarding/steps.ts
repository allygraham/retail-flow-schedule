import type { AppRole } from '@/types/domain';
export interface OnboardingState { welcomed: boolean; hidden: boolean; dismissed: boolean; completed: string[] }
export interface OnboardingStep { id: string; title: string; description: string; action: string; to: string }
export function onboardingSteps(role: AppRole): OnboardingStep[] {
 if (role === 'owner' || role === 'admin') return [
  { id: 'stores', title: 'Check business & store details', description: 'Confirm your store name, address and location.', action: 'Check store details', to: '/stores' },
  { id: 'policy', title: 'Set your leave policy', description: 'Choose your leave year. Employee entitlements are managed in Team.', action: 'Set leave policy', to: '/settings?section=business' },
  { id: 'team', title: 'Invite your team', description: 'Send invitations so your employees can join.', action: 'Invite your team', to: '/team' },
  { id: 'publish', title: 'Publish your first rota', description: 'Create shifts, review coverage and publish.', action: 'Open rota', to: '/rota' },
 ];
 if (role === 'manager') return [
  { id: 'team', title: 'Review your team', description: 'Find the people and stores you manage.', action: 'View team', to: '/team' },
  { id: 'publish', title: 'Publish a rota', description: 'Create shifts, review coverage and publish.', action: 'Open rota', to: '/rota' },
  { id: 'requests', title: 'Find requests needing review', description: 'Review leave in Leave & absence, and proposed cover in Shift changes.', action: 'View leave requests', to: '/leave' },
 ];
 return [
  { id: 'profile', title: 'Check your profile', description: 'Confirm your contact details.', action: 'View profile', to: '/profile' },
  { id: 'rota', title: 'Find your shifts', description: 'See your published rota.', action: 'View rota', to: '/rota' },
  { id: 'leave', title: 'Request time off', description: 'Find leave requests here. Use Shift changes to request cover or a swap.', action: 'View leave & absence', to: '/leave' },
 ];
}

export function readOnboardingState(value: unknown): OnboardingState {
 if (!value || typeof value !== 'object') throw new Error('Invalid onboarding progress');
 const state = value as Partial<OnboardingState>;
 if (state.dismissed !== undefined && typeof state.dismissed !== 'boolean') throw new Error('Invalid onboarding preference');
 if (typeof state.welcomed !== 'boolean' || typeof state.hidden !== 'boolean' || !Array.isArray(state.completed) || !state.completed.every(step => typeof step === 'string')) throw new Error('Invalid onboarding progress');
 return { welcomed: state.welcomed, hidden: state.hidden, dismissed: state.dismissed ?? false, completed: state.completed };
}

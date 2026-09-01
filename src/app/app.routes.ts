import { Routes } from '@angular/router';
import { GateComponent } from './components/gate/gate.component';
import { WelcomeComponent } from './components/welcome/welcome.component';
import { SetupComponent } from './components/setup/setup.component';
import { LockComponent } from './components/lock/lock.component';
import { VaultComponent } from './components/vault/vault.component';
import { FileDetailComponent } from './components/file-detail/file-detail.component';
import { SettingsComponent } from './components/settings/settings.component';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: '/gate' },
  { path: 'gate', component: GateComponent },
  { path: 'welcome', component: WelcomeComponent },
  { path: 'setup', component: SetupComponent },
  { path: 'setup-change', component: SetupComponent, data: { mode: 'change' } },
  { path: 'lock', component: LockComponent },
  { path: 'vault', component: VaultComponent },
  { path: 'file/:id', component: FileDetailComponent },
  { path: 'settings', component: SettingsComponent },
];

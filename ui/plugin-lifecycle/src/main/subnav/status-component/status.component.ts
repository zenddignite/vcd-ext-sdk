/*
 * Copyright 2018 VMware, Inc. All rights reserved. VMware Confidential
 */
import { Component, Inject, OnInit, OnDestroy } from "@angular/core";
import { EXTENSION_ASSET_URL } from "@vcd-ui/common";
import { Plugin } from "../../interfaces/Plugin";
import { PluginManager } from "../../services/plugin-manager.service";
import { Subscription, Observable, Subject } from "rxjs";
import { ModalData, ModalWindow } from "../../interfaces/Modal";
import { PluginValidator } from "../../classes/plugin-validator";
import { ScopeFeedback } from "../../classes/ScopeFeedback";
import { ChangeScopeService } from "../../services/change-scope.service";
import { Organisation } from "../../interfaces/Organisation";

interface SubjectModalData {
    accept: boolean;
}

@Component({
    selector: "vcd-plugin-status",
    templateUrl: "./status.component.html"
})
export class StatusComponent implements OnInit, OnDestroy {
    public selected: Plugin[];
    public plugins: Plugin[];
    public modal: ModalData;
    public changeScopeState: boolean = false;
    public wantToUpload: boolean;
    public isLoading: boolean;

    public watchPluginListSub: Subscription;

    public modalSubject = new Subject<SubjectModalData>();

    constructor(
        @Inject(EXTENSION_ASSET_URL) public assetUrl: string,
        private pluginManager: PluginManager,
        private changeScopeService: ChangeScopeService
    ) { }

    public ngOnInit() {
        this.selected = [];
        this.modal = new ModalWindow();
        this.watchPluginsList();
        this.plugins = this.pluginManager.getPlugins();
        this.wantToUpload = false;
    }

    public ngOnDestroy(): void {
        this.watchPluginListSub.unsubscribe();
    }

    public getOpened(): boolean {
        return this.modal.opened;
    }

    public setOpened(val: boolean): void {
        this.modal.waitToClose = false;
        this.modal.opened = val;
    }

    public emitAndClose(accept: boolean): void {
        if (!this.modal.waitToClose) {
            this.setOpened(false);
        }
        this.modalSubject.next({ accept });
    }

    public openModal(options: ModalData): Observable<SubjectModalData> {
        this.setOpened(true);
        this.modal.title = options.title || null;
        this.modal.body = options.body || null;
        this.modal.decline = options.decline || null;
        this.modal.accept = options.accept || null;
        this.modal.waitToClose = options.waitToClose || false;

        return this.modalSubject.asObservable();
    }

    public watchPluginsList(): void {
        this.watchPluginListSub = this.pluginManager.watchPluginList().subscribe((plugins: Plugin[]) => {
            this.plugins = plugins;
        });
    }

    public validateAction(hasToBe: boolean): Promise<void> {
        return PluginValidator.validateDisableEnableAction(this.selected, hasToBe, this.openModal.bind(this));
    }

    public onDisable(): void {
        this.validateAction(false)
            .then(() => {
                this.loading();

                return this.pluginManager
                    .disablePlugins(this.selected)
            })
            .then(() => {
                return this.pluginManager.refresh();
            })
            .then(() => {
                this.endLoading();
            })
            .catch((err) => {
                // Handle error
            });
    }

    public onEnable(): void {
        this.validateAction(true)
            .then(() => {
                this.loading();
                return this.pluginManager
                    .enablePlugins(this.selected);
            })
            .then(() => {
                return this.pluginManager.refresh();
            })
            .then(() => {
                this.endLoading();
            })
            .catch((err) => {
                // Handle Error
            });
    }

    public onDelete(): void {
        if (this.selected.length < 1) {
            return;
        }
        let onDeleteSub: Subscription;
        onDeleteSub = this.openModal({
            title: "Delete",
            body: "Are you sure you want to delete?",
            decline: "No",
            accept: "Yes",
            waitToClose: true
        })
            .subscribe((modalSubjectData: SubjectModalData) => {
                if (modalSubjectData.accept === false) {
                    this.setOpened(false);
                    onDeleteSub.unsubscribe();
                    return;
                }

                this.setOpened(false);
                onDeleteSub.unsubscribe();
                this.loading();

                this.pluginManager
                    .deletePlugins(this.selected)
                    .then(() => {
                        this.pluginManager.refresh();
                        this.endLoading();
                    })
                    .catch((err) => {
                        // Handle err
                        this.endLoading();
                    });
            });
    }

    public onUpload(): void {
        this.wantToUpload = true;
    }

    public openChangeScope(): void {
        this.changeScopeState = true;
    }

    public publishForAllTenants(): void {
        this.pluginManager
            .publishPluginForAllTenants(this.selected)
            .then(() => {
                return this.pluginManager.refresh();
            })
            .then(() => {
                this.changeScopeState = false;
            })
            .catch((err) => {
                // Handle Error
                console.warn(err);
            })
    }

    public publishForTenant(orgs: Organisation[]): void {
        const requests = this.pluginManager.publishPluginForSpecificTenants(this.selected, orgs, true);

        requests.forEach((element) => {
            const subs = element.req.subscribe(
                (res) => {
                    this.changeScopeService.changeReqStatusTo(res.url, true);
                    subs.unsubscribe();
                },
                (err) => {
                    // Handle Error
                    this.changeScopeService.changeReqStatusTo(element.url, false);
                    console.warn(err);
                }
            )
        });
    }

    public unpublishForAllTenants(): void {
        this.pluginManager
            .unpublishPluginForAllTenants(this.selected)
            .then(() => {
                return this.pluginManager.refresh();
            })
            .then(() => {
                this.changeScopeState = false;
            })
            .catch((err) => {
                // Handle Error
                console.warn(err);
            })
    }

    public unpublishForTenants(orgs: Organisation[]): void {
        const requests = this.pluginManager.unpublishPluginForSpecificTenants(this.selected, orgs, true);

        requests.forEach((element) => {
            const subs = element.req.subscribe(
                (res) => {
                    this.changeScopeService.changeReqStatusTo(res.url, true);
                    subs.unsubscribe();
                },
                (err) => {
                    // Handle Error
                    this.changeScopeService.changeReqStatusTo(element.url, false);
                    console.warn(err);
                }
            )
        });
    }

    public onChangeScope(data: ScopeFeedback): void {
        this.changeScopeService.clearChangeScopeReq();

        if (data.forAllTenants) {
            this.publishForAllTenants();
            return;
        }

        if (data.forTenant) {
            this.publishForTenant(data.orgs);
            return
        }

        if (data.unpublishForAllTenants) {
            this.unpublishForAllTenants();
            return;
        }

        if (data.unpublishForTenant) {
            this.unpublishForTenants(data.orgs);
            return;
        }
    }

    public setWantToUpload(val: boolean): void {
        this.wantToUpload = val;
    }

    public loading(): void {
        this.isLoading = true;
    }

    public endLoading(): void {
        this.isLoading = false;
    }
}

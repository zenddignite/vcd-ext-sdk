/*
 * Copyright 2018 VMware, Inc. All rights reserved. VMware Confidential
 */
import { Component, Inject, OnInit, Input, Output, EventEmitter, OnChanges, OnDestroy } from "@angular/core";
import { EXTENSION_ASSET_URL } from "@vcd-ui/common";
import { ScopeFeedback } from "../../classes/ScopeFeedback";
import { PluginManager } from "../../services/plugin-manager.service";
import { ChangeOrgScopeService } from "../../services/change-org-scope.service";
import { Subscription, Observable } from "rxjs";
import { ChangeScopeItem } from "../../interfaces/ChangeScopeItem";
import { OrganisationService } from "../../services/organisation.service";
import { Organisation } from "../../interfaces/Organisation";
import { Plugin } from "../../interfaces/Plugin";

@Component({
    selector: "vcd-change-org-scope",
    templateUrl: "./change-org-scope.component.html",
    styleUrls: ["./change-org-scope.component.scss"]
})
export class ChangeOrgScope implements OnInit {
    private _state: boolean = false;
    private _action: string;
    public feedback: ScopeFeedback = new ScopeFeedback();
    public showTracker: boolean;
    public listOfOrgsPerPlugin: ChangeScopeItem[];
    public orgs: Organisation[];
    public plugins: Plugin[];
    
    public watchSourceDataSub: Subscription;

    @Input()
    set state (val: boolean) {
        if (val === false) {
            this.feedback.reset();
            
            if (this.watchSourceData) {
                this.watchSourceDataSub.unsubscribe();
            }
        }

        if (val === true) {
            this.showTracker = false;
        }

        this._state = val;
    }
    @Output() public stateChange = new EventEmitter<boolean>();

    @Input()
    set action(val: string) {
        this._action = val;
        this.loadListOfOrgsPerPlugin();
    }

    constructor(
        @Inject(EXTENSION_ASSET_URL) public assetUrl: string,
        private pluginManager: PluginManager,
        private changeScopeService: ChangeOrgScopeService,
        private orgService: OrganisationService
    ) {}

    public ngOnInit(): void {
        this.showTracker = false;
    }

    get state (): boolean {
        return this._state;
    }

    get action (): string {
        return this._action;
    }

    public handleMixedScope(feedback: ScopeFeedback): void {
        this.showTracker = true;

        const requests = this.pluginManager.handleMixedScope(this.pluginManager.selectedPlugins, feedback, true);
        requests.forEach((element) => {
            const subscription = element.req.subscribe(
                (res) => {
                    this.changeScopeService.changeReqStatusTo(res.url, true);
                    subscription.unsubscribe();
                },
                (err) => {
                    // Handle Error
                    this.changeScopeService.changeReqStatusTo(element.url, false);
                    subscription.unsubscribe();
                    console.warn(err);
                }
            )
        });
    }

    public onUpdate(): void {
        if (this.feedback.data.length > 0) {
            this.handleMixedScope(this.feedback);
            return;
        }

        console.log("Please select some options...");
    }

    public onClose(): void {
        this.state = false;
        this.stateChange.emit(false);
    }

    public loadListOfOrgsPerPlugin(): void {
        this.loadOrgs();
        this.loadPlugins();
        this.populateList();
    }

    public loadOrgs(): void {
        this.orgs = this.orgService.orgs;
    }

    public loadPlugins(): void {
        this.plugins = this.pluginManager.selectedPlugins;
    }

    public watchSourceData(): void {
        this.watchSourceDataSub = Observable.concat<Plugin[], Organisation[]>(
            this.pluginManager.watchSelectedPlugins(),
            this.orgService.watchOrgs()
        ).subscribe((data) => {
            if (data.length === 0) {
                return;                
            }

            if (Object.keys(data[0]).indexOf("pluginName") !== -1) {
                this.plugins = <Plugin[]>data;
                return;
            }

            if (Object.keys(data[0]).indexOf("displayName") !== -1) {
                this.orgs = <Organisation[]>data;
                return;
            }
        }, (err) => {
            // Handle error
        });
    }

    public populateList(): void {
        this.listOfOrgsPerPlugin = [];
        this.orgs.forEach((org: Organisation) => {
            this.plugins.forEach(plugin => {
                this.listOfOrgsPerPlugin.push({ orgName: org.name, plugin: plugin.pluginName, action: this.action });           
            });
        });
    }
}
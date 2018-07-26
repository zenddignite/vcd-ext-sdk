/*
 * Copyright 2018 VMware, Inc. All rights reserved. VMware Confidential
 */
import { Component, OnInit, Input, Output, EventEmitter, OnDestroy } from "@angular/core";
import { Subscription } from "rxjs";
import { ChangeScopeRequest } from "../../classes/ChangeScopeRequest";
import { ChangeOrgScopeService } from "../../services/change-org-scope.service";

@Component({
    selector: "vcd-change-org-scope-tracker",
    templateUrl: "./change-org-scope-tracker.component.html"
})
export class ChangeOrgScopeTracker implements OnInit, OnDestroy {
    private _open: boolean = false;

    @Input() 
    set open(val: boolean) {
        if (val === false) {
            if (this.watchChangeScopeReq) {
                this.watchChangeScopeReq.unsubscribe();
            }
        }

        if (val === true) {
            this.loadRequests();
        }

        this._open = val;
    }
    @Output() openChange = new EventEmitter<boolean>();
    public requests: ChangeScopeRequest[];
    public watchChangeScopeReq: Subscription;

    constructor(
        private changeScopeService: ChangeOrgScopeService
    ) { }

    ngOnInit() {
        this.loadRequests();
    }

    ngOnDestroy() {
        if (this.watchChangeScopeReq) {
            this.watchChangeScopeReq.unsubscribe();
        }
    }

    get open(): boolean {
        return this._open;
    }

    public loadRequests(): void {
        this.watchChangeScopeReq = this.changeScopeService.watchChangeScopeReq().subscribe((data) => {
            this.requests = data;
        });
    }

    public onClose(): void {
        this.open = false;
        this.changeScopeService.clearChangeScopeReq();
        this.openChange.emit(false);
    }
}
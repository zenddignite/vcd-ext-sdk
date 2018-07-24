/*
 * Copyright 2018 VMware, Inc. All rights reserved. VMware Confidential
 */
import { Component, Inject, OnInit, Input } from "@angular/core";
import { EXTENSION_ASSET_URL } from "@vcd-ui/common";
import { UploadPayload } from "../../interfaces/Plugin";

@Component({
    selector: "vcd-manifest-stack-view",
    templateUrl: "./manifest-stack-view.component.html"
})
export class VcdManifestStackView implements OnInit {
    @Input() parsing: boolean;
    @Input() uploadPayload: UploadPayload;

    constructor(
        @Inject(EXTENSION_ASSET_URL) public assetUrl: string
    ) { }

    ngOnInit() {}
}
var Ally;
(function (Ally) {
    var InvoiceMailingEntry = /** @class */ (function () {
        function InvoiceMailingEntry() {
        }
        return InvoiceMailingEntry;
    }());
    var InvoiceFullMailing = /** @class */ (function () {
        function InvoiceFullMailing() {
        }
        return InvoiceFullMailing;
    }());
    var FullMailingResult = /** @class */ (function () {
        function FullMailingResult() {
        }
        return FullMailingResult;
    }());
    /**
     * The controller for the invoice mailing view
     */
    var MailingInvoiceController = /** @class */ (function () {
        /**
        * The constructor for the class
        */
        function MailingInvoiceController($http, siteInfo, fellowResidents, wizardHandler, $scope, $timeout, $location) {
            var _this = this;
            this.$http = $http;
            this.siteInfo = siteInfo;
            this.fellowResidents = fellowResidents;
            this.wizardHandler = wizardHandler;
            this.$scope = $scope;
            this.$timeout = $timeout;
            this.$location = $location;
            this.isLoading = false;
            this.selectedEntries = [];
            this.numEmailsToSend = 0;
            this.numPaperLettersToSend = 0;
            this.paperInvoiceDollars = 2;
            this.homesGridOptions =
                {
                    data: [],
                    columnDefs: [
                        {
                            field: "homeNames",
                            displayName: AppConfig.homeName
                        },
                        {
                            field: "ownerNames",
                            displayName: "Owners"
                        },
                        {
                            field: "amountDue",
                            displayName: "Amount Due",
                            width: 120,
                            cellTemplate: '<div class="ui-grid-cell-contents">$<input type="number" style="width: 90%;" data-ng-model="row.entity.amountDue" /></div>'
                        }
                        //,{
                        //    field: "unitIds",
                        //    displayName: "",
                        //    width: 130,
                        //    cellTemplate: '<div class="ui-grid-cell-contents"><a data-ng-href="/api/Mailing/Preview/Invoice/{{row.entity.unitIds}}?ApiAuthToken=' + this.siteInfo.authToken + '" target="_blank">Preview Invoice</a></div>'
                        //}
                    ],
                    enableSorting: true,
                    enableHorizontalScrollbar: 0,
                    enableVerticalScrollbar: 0,
                    enableColumnMenus: false,
                    minRowsToShow: 5,
                    enableRowHeaderSelection: true,
                    multiSelect: true,
                    enableSelectAll: true,
                    onRegisterApi: function (gridApi) {
                        _this.gridApi = gridApi;
                        var updateFromSelection = function () {
                            var selectedRows = gridApi.selection.getSelectedRows();
                            _this.selectedEntries = selectedRows;
                            //_.forEach( <InvoiceMailingEntry[]>this.homesGridOptions.data, e => e.shouldIncludeForSending = false );
                            //_.forEach( this.selectedEntries, e => e.shouldIncludeForSending = true );
                        };
                        gridApi.selection.on.rowSelectionChanged($scope, function (row) { return updateFromSelection(); });
                        gridApi.selection.on.rowSelectionChangedBatch($scope, function (row) { return updateFromSelection(); });
                        // Fix dumb scrolling
                        HtmlUtil.uiGridFixScroll();
                    }
                };
        }
        /**
        * Called on each controller after all the controllers on an element have been constructed
        */
        MailingInvoiceController.prototype.$onInit = function () {
            var _this = this;
            this.authToken = this.siteInfo.authToken;
            this.loadMailingInfo();
            this.$scope.$on('wizard:stepChanged', function (event, args) {
                _this.numEmailsToSend = _.filter(_this.selectedEntries, function (e) { return e.shouldSendEmail; }).length;
                _this.numPaperLettersToSend = _.filter(_this.selectedEntries, function (e) { return e.shouldSendPaperMail; }).length;
                // If we moved to the second step
                //if( args.index === 1 )
                //    this.$timeout( () => this.showMap = true, 50 );
                //else
                //    this.showMap = false;
            });
        };
        MailingInvoiceController.prototype.previewInvoice = function (entry) {
            var entryInfo = encodeURIComponent(JSON.stringify(entry));
            var invoiceUri = "/api/Mailing/Preview/Invoice?ApiAuthToken=" + this.authToken + "&fromAddress=" + encodeURIComponent(this.fullMailingInfo.fromAddress) + "&notes=" + encodeURIComponent(this.fullMailingInfo.notes) + "&mailingInfo=" + entryInfo;
            window.open(invoiceUri, "_blank");
        };
        MailingInvoiceController.prototype.onFinishedWizard = function () {
            var _this = this;
            if (this.numPaperLettersToSend === 0)
                return;
            var stripeKey = "pk_test_FqHruhswHdrYCl4t0zLrUHXK";
            var checkoutHandler = StripeCheckout.configure({
                key: stripeKey,
                image: '/assets/images/icons/Icon-144.png',
                locale: 'auto',
                email: this.siteInfo.userInfo.emailAddress,
                token: function (token) {
                    // You can access the token ID with `token.id`.
                    // Get the token ID to your server-side code for use.
                    _this.fullMailingInfo.stripeToken = token.id;
                    _this.submitFullMailingAfterCharge();
                }
            });
            this.isLoading = true;
            // Open Checkout with further options:
            checkoutHandler.open({
                name: 'Community Ally',
                description: "Mailing " + this.numPaperLettersToSend + " invoice" + (this.numPaperLettersToSend === 1 ? '' : 's'),
                zipCode: true,
                amount: this.numPaperLettersToSend * this.paperInvoiceDollars * 100 // Stripe uses cents
            });
            // Close Checkout on page navigation:
            window.addEventListener('popstate', function () {
                checkoutHandler.close();
            });
        };
        MailingInvoiceController.prototype.submitFullMailingAfterCharge = function () {
            var _this = this;
            this.isLoading = true;
            this.$http.post("/api/Mailing/Send/Invoice", this.fullMailingInfo).then(function (response) {
                _this.isLoading = false;
                var message = "Your invoices have been successfully sent" + (response.data.hadErrors ? ', but there were errors' : '') + ". You can view the status in the history tab.";
                alert(message);
                _this.$location.path("/Mailing/History");
            }, function (response) {
                _this.isLoading = false;
                alert("There was a problem sending your mailing, none were sent and you were not charged. Error: " + response.data.exceptionMessage);
            });
        };
        /**
        * Retrieve mailing info from the server
        */
        MailingInvoiceController.prototype.loadMailingInfo = function () {
            var _this = this;
            this.isLoading = true;
            this.$http.get("/api/Mailing/RecipientInfo").then(function (response) {
                _this.isLoading = false;
                _this.fullMailingInfo = response.data;
                _this.homesGridOptions.data = response.data.mailingEntries;
                _this.$timeout(function () { return _this.gridApi.selection.selectAllRows(); }, 10);
            });
        };
        MailingInvoiceController.prototype.toggleAllSending = function (type) {
            if (this.selectedEntries.length === 0)
                return;
            if (type === "email") {
                var shouldSetTo = !this.selectedEntries[0].shouldSendEmail;
                for (var i = 0; i < this.selectedEntries.length; ++i) {
                    if (HtmlUtil.isNullOrWhitespace(this.selectedEntries[i].emailAddress))
                        this.selectedEntries[i].shouldSendEmail = false;
                    else
                        this.selectedEntries[i].shouldSendEmail = shouldSetTo;
                }
            }
            else {
                var shouldSetTo = !this.selectedEntries[0].shouldSendPaperMail;
                for (var i = 0; i < this.selectedEntries.length; ++i) {
                    if (HtmlUtil.isNullOrWhitespace(this.selectedEntries[i].streetAddress))
                        this.selectedEntries[i].shouldSendPaperMail = false;
                    else
                        this.selectedEntries[i].shouldSendPaperMail = shouldSetTo;
                }
            }
        };
        MailingInvoiceController.$inject = ["$http", "SiteInfo", "fellowResidents", "WizardHandler", "$scope", "$timeout", "$location"];
        return MailingInvoiceController;
    }());
    Ally.MailingInvoiceController = MailingInvoiceController;
})(Ally || (Ally = {}));
CA.angularApp.component("mailingInvoice", {
    templateUrl: "/ngApp/common/mailing/mailing-invoice.html",
    controller: Ally.MailingInvoiceController
});
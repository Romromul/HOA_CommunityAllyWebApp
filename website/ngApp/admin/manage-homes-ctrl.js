var Ally;
(function (Ally) {
    /**
     * The controller for the admin-only page to manage group homes/units
     */
    var ManageHomesController = /** @class */ (function () {
        /**
            * The constructor for the class
            */
        function ManageHomesController($http, $q) {
            this.$http = $http;
            this.$q = $q;
            this.isLoading = false;
            this.unitToEdit = new Ally.Unit();
            this.isEdit = false;
        }
        /**
        * Called on each controller after all the controllers on an element have been constructed
        */
        ManageHomesController.prototype.$onInit = function () {
            this.refresh();
        };
        /**
         * Populate the page
         */
        ManageHomesController.prototype.refresh = function () {
            this.isLoading = true;
            var innerThis = this;
            this.$http.get("/api/Unit?includeAddressData=true").then(function (httpResponse) {
                innerThis.isLoading = false;
                innerThis.units = httpResponse.data;
            }, function () {
                innerThis.isLoading = false;
                alert("Failed to load homes");
            });
        };
        /**
         * Occurs when the user presses the button to create a new unit
         */
        ManageHomesController.prototype.onCreateUnitClick = function () {
            $("#AddUnitForm").validate();
            if (!$("#AddUnitForm").valid())
                return;
            this.isLoading = true;
            var innerThis = this;
            var onSave = function () {
                innerThis.isLoading = false;
                innerThis.isEdit = false;
                innerThis.unitToEdit = new Ally.Unit();
                innerThis.refresh();
            };
            if (this.isEdit)
                this.$http.put("/api/Unit", this.unitToEdit).then(onSave);
            else
                this.$http.post("/api/Unit", this.unitToEdit).then(onSave);
        };
        /**
         * Occurs when the user presses the button to edit a unit
         */
        ManageHomesController.prototype.onEditUnitClick = function (unit) {
            this.isEdit = true;
            this.unitToEdit = unit;
            if (unit.fullAddress)
                this.unitToEdit.streetAddress = unit.fullAddress.oneLiner;
        };
        /**
         * Occurs when the user presses the button to delete a unit
         */
        ManageHomesController.prototype.onDeleteUnitClick = function (unit) {
            var innerThis = this;
            this.$http.delete("/api/Unit/" + unit.unitId).then(function () {
                innerThis.refresh();
            });
        };
        /**
         * Occurs when the user presses the button to fast add units
         */
        ManageHomesController.prototype.onFastAddUnits = function () {
            var _this = this;
            this.isLoading = true;
            var innerThis = this;
            this.$http.post("/api/Unit?fastAdd=" + this.lastFastAddName, null).then(function () {
                _this.isLoading = false;
                innerThis.refresh();
            }, function (response) {
                _this.isLoading = false;
                alert("Failed fast add:" + response.data.exceptionMessage);
            });
        };
        /**
         * Occurs when the user presses the button to add units from the multi-line text box
         */
        ManageHomesController.prototype.onAddUnitsPerLine = function () {
            var postData = {
                action: "onePerLine",
                lines: this.unitNamePerLine
            };
            this.isLoading = true;
            var innerThis = this;
            this.$http.post("/api/Unit?onePerLine=1", postData).then(function () {
                innerThis.isLoading = false;
                innerThis.refresh();
            }, function () {
                innerThis.isLoading = false;
                alert("Failed");
            });
        };
        /**
         * Occurs when the user presses the button to add homes from the address multi-line text box
         */
        ManageHomesController.prototype.onAddUnitsByAddressPerLine = function () {
            var postData = {
                action: "onePerLine",
                lines: this.unitAddressPerLine
            };
            this.isLoading = true;
            var innerThis = this;
            this.$http.post("/api/Unit/FromAddresses", postData).then(function () {
                innerThis.isLoading = false;
                innerThis.refresh();
            }, function () {
                innerThis.isLoading = false;
                alert("Failed");
            });
        };
        ///////////////////////////////////////////////////////////////////////////////////////////////
        // Occurs when the user presses the button to delete all units
        ///////////////////////////////////////////////////////////////////////////////////////////////
        ManageHomesController.prototype.onDeleteAllClick = function () {
            if (!confirm("This will delete every unit! This should only be used for new sites!"))
                return;
            var innerThis = this;
            this.$http.get("/api/Unit?deleteAction=all").then(function () {
                innerThis.refresh();
            }, function () {
            });
        };
        ManageHomesController.$inject = ["$http", "$rootScope"];
        return ManageHomesController;
    }());
    Ally.ManageHomesController = ManageHomesController;
})(Ally || (Ally = {}));
CA.angularApp.component("manageHomes", {
    templateUrl: "/ngApp/admin/manage-homes.html",
    controller: Ally.ManageHomesController
});
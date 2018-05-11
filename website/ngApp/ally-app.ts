﻿// DEVLOCAL - Specify your group's API path to make all API requests to the live server, regardless
// of the local URL. This is useful when developing locally. 
var OverrideBaseApiPath: string = null;
// For example: var OverrideBaseApiPath: string = "https://123fake.condoally.com";


// Values defined in app-config.js, used in generating the site menu
declare var Role_All: string;
declare var Role_Authorized: string;
declare var Role_Manager: string;
declare var Role_Admin: string;

CA.angularApp.config(
['$routeProvider', '$httpProvider', '$provide', "SiteInfoProvider", "$locationProvider",
    function( $routeProvider: ng.route.IRouteProvider, $httpProvider: ng.IHttpProvider, $provide: ng.auto.IProvideService, siteInfoProvider: Ally.SiteInfoProvider, $locationProvider: ng.ILocationProvider )
{
    $locationProvider.hashPrefix( '!' );

    var subdomain = HtmlUtil.getSubdomain( OverrideBaseApiPath );      
    if( subdomain === null && window.location.hash !== "#!/Login" )
    {
        GlobalRedirect( AppConfig.baseUrl );
        return;
    }

    var isLoginRequired = function( $location: ng.ILocationService, $q: ng.IQService, siteInfo: Ally.SiteInfoService, appCacheService: AppCacheService )
    {
        var deferred = $q.defer();

        // We have no user information so they must login
        if( !siteInfo.userInfo )
        {
            // Home, the default page, and login don't need special redirection or user messaging
            if( $location.path() !== "/Home" && $location.path() !== "/Login" )
            {
                appCacheService.set( appCacheService.Key_AfterLoginRedirect, $location.path() );
                appCacheService.set( appCacheService.Key_WasLoggedIn401, "true" );
            }

            deferred.reject();
            $location.path( '/Login' );
        }
        // The user does not need to login
        else
            deferred.resolve();

        return deferred.promise;
    };

    var universalResolvesWithLogin = {
        app: ["$q", "$http", "$rootScope", "$sce", "$location", "xdLocalStorage", "appCacheService",
        function( $q: ng.IQService, $http: ng.IHttpService, $rootScope: ng.IRootScopeService, $sce: ng.ISCEService, $location: ng.ILocationService, xdLocalStorage: any, appCacheService: AppCacheService )
        {
            return Ally.SiteInfoHelper.loginInit( $q, $http, $rootScope, $sce, xdLocalStorage ).then( function( siteInfo: Ally.SiteInfoService )
            {
                return isLoginRequired( $location, $q, siteInfo, appCacheService );
            } );
        }]
    };

    var universalResolves = {
        app: ["$q", "$http", "$rootScope", "$sce", "xdLocalStorage", Ally.SiteInfoHelper.loginInit]
    };

    // This allows us to require SiteInfo to be retrieved before the app runs
    var customRouteProvider = angular.extend( {}, $routeProvider,
        {
            when: function( path: string, route: any )
            {
                route.resolve = ( route.resolve ) ? route.resolve : {};

                if( route.allyRole === Role_All )
                    angular.extend( route.resolve, universalResolves );
                else
                    angular.extend( route.resolve, universalResolvesWithLogin );

                $routeProvider.when( path, route );
                return this;
            }
        } );

    // Build our Angular routes
    for( var i = 0; i < AppConfig.menu.length; ++i )
    {
        var menuItem = AppConfig.menu[i];

        var routeObject: any = {
            controller: menuItem.controller,
            allyRole: menuItem.role
        };

        if( menuItem.templateUrl )
            routeObject.templateUrl = menuItem.templateUrl;
        else
            routeObject.template = menuItem.templateHtml;

        if( menuItem.controllerAs )
            routeObject.controllerAs = menuItem.controllerAs;

        customRouteProvider.when( menuItem.path, routeObject );
    }

    $routeProvider.otherwise( { redirectTo: "/Home" } );
        
    // Create an interceptor to redirect to the login page when unauthorized
    $provide.factory( "http403Interceptor", ["$q", "$location", "$rootScope", "appCacheService", "$injector", function( $q: ng.IQService, $location: ng.ILocationService, $rootScope: ng.IRootScopeService, appCacheService: AppCacheService, $injector: ng.auto.IInjectorService )
    {
        return {
            response: function( response: any )
            {
                // Let success pass through
                return response;
            },

            responseError: function( response: any )
            {
                var status = response.status;

                // 401 - Unauthorized (not logged-in)
                // 403 - Forbidden (Logged-in, but not allowed to perform the action
                if( status === 401 || status === 403 )
                {
                    // If the user's action is forbidden and we should not auto-handle the response
                    if( status === 403 && $rootScope.dontHandle403 )
                        return $q.reject( response );

                    // If the user's action is forbidden and is logged-in then set this flag so we
                    // can display a helpful error message
                    if( status === 403 && $rootScope.isLoggedIn )
                        appCacheService.set( appCacheService.Key_WasLoggedIn403, "true" );

                    // If the user is unauthorized but has saved credentials, try to log-in then retry the request
                    if( status === 401 && HtmlUtil.isValidString( window.localStorage["rememberMe_Email"] ) )
                    {
                        var $http = <ng.IHttpService>$injector.get( "$http" );

                        // Multiple requests can come in at the same time with 401, so let's store
                        // our login promise so subsequent calls can tie into the first login
                        // request
                        if( !$rootScope.retryLoginDeffered )
                        {
                            $rootScope.retryLoginDeffered = $q.defer();

                            var loginInfo = {
                                emailAddress: window.localStorage["rememberMe_Email"],
                                password: atob( window.localStorage["rememberMe_Password"] )
                            };

                            var retryLogin = function()
                            {
                                $http.post( "/api/Login", loginInfo ).then( function( httpResponse )
                                {
                                    var loginData: any = httpResponse.data;

                                    var siteInfo = <Ally.SiteInfoService>$injector.get( "SiteInfo" );

                                    // Store the new auth token
                                    siteInfo.setAuthToken( loginData.authToken );

                                    var loginDeffered = $rootScope.retryLoginDeffered;

                                    loginDeffered.resolve();

                                }, function()
                                {
                                    // Login failed so bail out all the way
                                    var loginDeffered = $rootScope.retryLoginDeffered;


                                    $rootScope.onLogOut_ClearData();
                                    loginDeffered.reject();

                                } ).finally( function()
                                {
                                    $rootScope.retryLoginDeffered = null;
                                } );
                            };

                            // Wait, just a bit, to let any other requests come in with a 401
                            setTimeout( retryLogin, 1000 );
                        }

                        var retryRequestDeferred = $q.defer();

                        $rootScope.retryLoginDeffered.promise.then( function()
                        {
                            // Retry the request
                            retryRequestDeferred.resolve( $http( response.config ) );

                            //$http( response.config ).then( function( newResponse )
                            //{
                            //    retryRequestDeferred.resolve( newResponse );
                            //}, function()
                            //{
                            //    retryRequestDeferred.reject( response );
                            //} );
                        }, function()
                            {
                                retryRequestDeferred.reject( response );
                            } );

                        return retryRequestDeferred.promise;
                    }

                    // Home, the default page, and login don't need special redirection or user messaging
                    if( $location.path() !== "/Home" && $location.path() !== "/Login" )
                    {
                        appCacheService.set( appCacheService.Key_AfterLoginRedirect, $location.path() );
                        appCacheService.set( appCacheService.Key_WasLoggedIn401, "true" );
                    }

                    // The use is not authorized so let's clear the session data
                    $rootScope.onLogOut_ClearData();
                }


                // If we didn't handle the response up above then simply reject it
                return $q.reject( response );
            }
        };
    }] );

    $httpProvider.interceptors.push( 'http403Interceptor' );

    // Make date strings convert to date objects
    ( <any>$httpProvider.defaults.transformResponse ).push( function( responseData: any )
    {
        Ally.HtmlUtil2.convertStringsToDates( responseData );
        return responseData;
    } );


    // Create an interceptor so we can add our auth token header. Also, this allows us to set our
    // own base URL for API calls so local testing can use the live API.
    $provide.factory( "apiUriInterceptor", ["$rootScope", function( $rootScope: ng.IRootScopeService )
    {
        // If we're making a request because the Angular app's run block, then see if we have
        // a cached auth token
        if( typeof ( $rootScope.authToken ) !== "string" && window.localStorage )
            $rootScope.authToken = window.localStorage.getItem( "ApiAuthToken" );
        
        return {
            request: function( reqConfig: ng.IRequestConfig ): ng.IRequestConfig
            {
                // If we're talking to the Community Ally API server
                if( HtmlUtil.startsWith( reqConfig.url, "/api/" ) )
                {
                    // If we have an overridden URL to use for API requests
                    if( !HtmlUtil.isNullOrWhitespace( OverrideBaseApiPath ) )
                    {
                        reqConfig.url = OverrideBaseApiPath + reqConfig.url;
                    }

                    // Add the auth token
                    reqConfig.headers["Authorization"] = "Bearer " + $rootScope.authToken;
                }

                return reqConfig;
            }
        };
    }] );

    $httpProvider.interceptors.push( "apiUriInterceptor" );
    
}] );


CA.angularApp.run( ["$rootScope", "$http", "$sce", "$location", "$templateCache", "$cacheFactory", "xdLocalStorage",
    function( $rootScope: ng.IRootScopeService, $http: ng.IHttpService, $sce: ng.ISCEService, $location: ng.ILocationService, $templateCache: ng.ITemplateCacheService, $cacheFactory: ng.ICacheFactoryService, xdLocalStorage: any )
    {
        $rootScope.bgImagePath = "/assets/images/Backgrounds/";
        $rootScope.appConfig = AppConfig;
        $rootScope.isLoggedIn = false;

        $rootScope.publicSiteInfo = {};

        $rootScope.hideMenu = false;

        $rootScope.isAdmin = false;
        $rootScope.isSiteManager = false;

        $rootScope.menuItems = _.where( AppConfig.menu, function( menuItem: Ally.MenuItem_v3 ) { return !HtmlUtil.isNullOrWhitespace( menuItem.menuTitle ); } );

        $rootScope.mainMenuItems = _.where( $rootScope.menuItems, function( menuItem: Ally.MenuItem_v3 ) { return menuItem.role === Role_Authorized; } );
        $rootScope.manageMenuItems = _.where( $rootScope.menuItems, function( menuItem: Ally.MenuItem_v3 ) { return menuItem.role === Role_Manager; } );
        $rootScope.adminMenuItems = _.where( $rootScope.menuItems, function( menuItem: Ally.MenuItem_v3 ) { return menuItem.role === Role_Admin; } );

        // Test localStorage here, fails in private browsing mode
        

        // If we have the association's public info cached then use it to load faster
        if( HtmlUtil.isLocalStorageAllowed() ) 
        {
            if( window.localStorage )
            {
                $rootScope.publicSiteInfo = angular.fromJson( window.localStorage.getItem( "siteInfo" ) );
                $rootScope.authToken = window.localStorage.getItem( "ApiAuthToken" );

                if( $rootScope.publicSiteInfo === null || $rootScope.publicSiteInfo === undefined )
                    $rootScope.publicSiteInfo = {};
                else
                {
                    // Update the background
                    //if( !HtmlUtil.isNullOrWhitespace( $rootScope.publicSiteInfo.bgImagePath ) )
                    //    $( document.documentElement ).css( "background-image", "url(" + $rootScope.bgImagePath + $rootScope.publicSiteInfo.bgImagePath + ")" );
                }
            }
        }

        xdLocalStorage.init(
            {
                /* required */
                iframeUrl: "https://communityally.org/xd-local-storage.html"
            } ).then( function()
            {
                //an option function to be called once the iframe was loaded and ready for action
                //console.log( 'Got xdomain iframe ready' );
            } );
        

        // Clear all local information about the logged-in user
        $rootScope.onLogOut_ClearData = function()
        {
            $rootScope.userInfo = {};
            $rootScope.isLoggedIn = false;
            $rootScope.isAdmin = false;
            $rootScope.isSiteManager = false;
            $rootScope.authToken = "";
            window.localStorage["rememberMe_Email"] = null;
            window.localStorage["rememberMe_Password"] = null;
            xdLocalStorage.removeItem( "allyApiAuthToken" );

            // Clear cached request results
            $cacheFactory.get( '$http' ).removeAll();

            if( window.localStorage )
                window.localStorage.removeItem( "siteInfo" );
            $location.path( '/Login' );
        };


        // Log-out and notify the server
        $rootScope.onLogOut = function()
        {
            $http.get( "/api/Login/Logout" ).then( $rootScope.onLogOut_ClearData, $rootScope.onLogOut_ClearData );
        };


        // Clear the cache if needed
        $rootScope.$on( '$routeChangeStart', function()
        {
            if( CA.clearTemplateCacheIfNeeded )
                CA.clearTemplateCacheIfNeeded( $templateCache );
        } );


        // Keep track of our current page
        $rootScope.$on( "$routeChangeSuccess", function( event, toState, toParams, fromState )
        {
            $rootScope.curPath = $location.path();

            // If there is a query string, track it
            var queryString = "";
            var path = $location.path();
            if( path.indexOf( "?" ) !== -1 )
                queryString = path.substring( path.indexOf( "?" ), path.length );

            // If there is a referrer, track it
            var referrer = "";
            if( fromState && fromState.name )
                referrer = $location.protocol() + "://" + $location.host() + "/#" + fromState.url;

            // Tell Segment about the route change
            analytics.page( {
                path: path,
                referrer: referrer,
                search: queryString,
                url: $location.absUrl()
            } );
        } );
    }
] );

 
//CA.angularApp.provider( '$exceptionHandler', {
//    $get: function( errorLogService )
//    {
//        return errorLogService;
//    }
//} );

//CA.angularApp.factory( "errorLogService", ["$log", function( $log )
//{
//    return function( exception )
//    {
//        $log.error.apply( $log, arguments );

//        if( typeof ( analytics ) !== "undefined" )
//            analytics.track( "AngularJS Error", { error: exception.message, stack: exception.stack } );
//    }
//}] );


namespace Ally
{
    export class MenuItem_v3
    {
        path: string;
        templateHtml: string;
        menuTitle: string;
        role: string;
    }
}
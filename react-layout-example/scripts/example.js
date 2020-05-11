var SizeDisplayer = React.createClass({
    render: function() {
        var style = {
            overflow: 'auto',
        };
        $.extend(style, this.props.style);
        return (
            <div style={style}>
                <p>{this.props.message}</p>
                <p>{this.props.width} x {this.props.height}</p>
                <p>Lorem ipsum dolor sit amet, consectetur adipiscing elit. Integer lectus lacus, ultrices at interdum at, varius in eros. Donec at odio vitae lectus laoreet rhoncus vestibulum non diam. Fusce orci orci, pretium quis fringilla sed, condimentum sit amet orci. Phasellus vitae vulputate nulla. In hac habitasse platea dictumst. Sed gravida et massa vel molestie. Aliquam ut enim pharetra, tristique enim eget, porta nunc. Duis volutpat vestibulum tellus, eu auctor erat auctor nec. Maecenas eu enim dolor. Nulla efficitur quam non dictum lacinia. Aliquam sit amet orci ut elit posuere venenatis nec ut libero.

Vestibulum ante ipsum primis in faucibus orci luctus et ultrices posuere cubilia Curae; Nullam non quam molestie, placerat est id, condimentum risus. Fusce at libero pretium magna malesuada porta id a odio. Duis commodo, diam a maximus faucibus, turpis dolor commodo ante, accumsan blandit nisi sem id dui. Nunc nisi felis, luctus ut scelerisque et, finibus sit amet orci. Donec ligula dolor, imperdiet eget lorem id, facilisis pulvinar odio. Aenean hendrerit varius nulla, sit amet mattis nulla aliquet eu. Sed vestibulum libero ante, eu varius nisl aliquet sit amet. Nullam accumsan rhoncus pulvinar.

Integer dapibus libero elit, ut dictum turpis vehicula nec. Maecenas at ex eget mi rutrum lobortis. Nulla id imperdiet ligula. Sed placerat, sem nec laoreet vestibulum, erat neque lobortis quam, vel venenatis diam est at massa. Pellentesque ac vulputate odio, id laoreet sapien. Mauris consectetur sit amet massa eget dictum. Etiam metus mauris, iaculis et euismod sit amet, volutpat ac est. Sed a diam vestibulum, semper lorem commodo, lacinia tortor. Curabitur mollis elit eu dui lobortis, et sollicitudin lectus pharetra.

Cum sociis natoque penatibus et magnis dis parturient montes, nascetur ridiculus mus. Fusce eu orci dolor. Donec eu malesuada sem. Maecenas id pellentesque urna. Phasellus nec arcu felis. Sed faucibus, nibh eget scelerisque mattis, mauris ex feugiat risus, non dictum tortor leo in dui. Praesent sed urna ac sem facilisis tempus tincidunt eu massa. Nullam ut placerat ligula. Donec ultrices ex nisi, vitae interdum nibh iaculis id. Proin at massa laoreet enim tempor pretium id quis nibh. Vestibulum maximus tellus sed pharetra vulputate. Cras eget eleifend metus, malesuada facilisis neque.

Class aptent taciti sociosqu ad litora torquent per conubia nostra, per inceptos himenaeos. Nunc ac dui urna. Donec at volutpat mauris, et efficitur tortor. Sed a condimentum ante, quis tincidunt odio. Aliquam vitae leo blandit, ornare est sed, sodales massa. Cras sit amet orci condimentum, auctor sapien a, lacinia neque. Quisque vel finibus magna.</p>
            </div>
        );
    }
});


var SPLITTER_ORIENTATION = {
    TOP: 'top',
    BOTTOM: 'bottom',
    LEFT: 'left',
    RIGHT: 'right',
};


var Splitter = React.createClass({
    propTypes: {
        orientation: React.PropTypes.string.isRequired,
        minInnerSize: React.PropTypes.number,
        minOuterSize: React.PropTypes.number,
        onResize: React.PropTypes.func,
    },

    getDefaultProps: function() {
        return {
            minInnerSize: 50,
            minOuterSize: 50,
        };
    },

    getInitialState: function() {
        return {
            splitSize: this.props.initialSplitSize,
            width: 0,
            height: 0,
        };
    },

    _handleResize: function(event, ui) {
        var size;
        switch (this.props.orientation) {
        case SPLITTER_ORIENTATION.TOP:
        case SPLITTER_ORIENTATION.BOTTOM:
            size = ui.size.height;
            break;
        case SPLITTER_ORIENTATION.LEFT:
        case SPLITTER_ORIENTATION.RIGHT:
            size = ui.size.width;
            break;
        }
        this.setState({splitSize: size});
        if (this.props.onResize) {
            this.props.onResize(this, size, this.props.height - size - 1);
        }

        // jquery-ui's resizable messes with 'left' and 'top'.
        domNode = $(this.refs._inner.getDOMNode());
        domNode.css('left', '0px');
        domNode.css('top', '0px');
    },

    _getResizeHandles() {
        switch (this.props.orientation) {
        case SPLITTER_ORIENTATION.TOP:
            return 's';
        case SPLITTER_ORIENTATION.BOTTOM:
            return 'n';
        case SPLITTER_ORIENTATION.LEFT:
            return 'e';
        case SPLITTER_ORIENTATION.RIGHT:
            return 'w';
        }
    },

    isVertical: function() {
        return this.props.orientation == SPLITTER_ORIENTATION.TOP ||
            this.props.orientation == SPLITTER_ORIENTATION.BOTTOM;
    },

    isHorizontal: function() {
        return !this.isVertical();
    },

    _setupResizable: function() {
        var maxSplitSize;
        var newState = null;
        var splitSize = this.state.splitSize;
        var width = this.getDOMNode().offsetWidth;
        var height = this.getDOMNode().offsetHeight;

        if (this.isVertical()) {
            maxSplitSize = height - this.props.minOuterSize;
        } else {
            maxSplitSize = width - this.props.minOuterSize;
        }
        if (splitSize > maxSplitSize) {
            splitSize = maxSplitSize;
        }

        if (width != this.state.width || height != this.state.height || splitSize != this.state.splitSize) {
            if (splitSize != this.state.splitSize) {
                this.props.onResize(this, splitSize, this.props.height - splitSize - 1);
            }
            this.setState({
                width: width,
                height: height,
                splitSize: splitSize,
            });
        } else {
            params = {
                handles: this._getResizeHandles(),
                resize: this._handleResize,
            };
            if (this.isVertical()) {
                params.minHeight = this.props.minInnerSize;
                params.maxHeight = height - this.props.minOuterSize - 2;
            } else {
                params.minWidth = this.props.minInnerSize;
                params.maxWidth = width - this.props.minOuterSize - 1;
            }
            $(this.refs._inner.getDOMNode()).resizable(params);
        }
    },

    componentDidMount: function() {
        this._setupResizable();
    },

    componentDidUpdate: function(prevProps, prevState) {
        this._setupResizable();
    },

    _getBorderStyle: function() {
        switch (this.props.orientation) {
        case SPLITTER_ORIENTATION.TOP:
            return 'none none solid none';
        case SPLITTER_ORIENTATION.BOTTOM:
            return 'solid none none none';
        case SPLITTER_ORIENTATION.LEFT:
            return 'none solid none none';
        case SPLITTER_ORIENTATION.RIGHT:
            return 'none none none solid';
        }
    },

    _getViewSizes() {
        var width1;
        var height1;
        var width2;
        var height2;
        if (this.isVertical()) {
            width1 = '100%';
            width2 = '100%';
            height1 = this.state.splitSize;
            height2 = this.state.height - this.state.splitSize - 1;
        } else {
            width1 = this.state.splitSize;
            width2 = this.state.width - this.state.splitSize - 1;
            height1 = '100%';
            height2 = '100%';
        }
        return {
            'width1': width1,
            'height1': height1,
            'width2': width2,
            'height2': height2,
        };
    },

    render: function() {
        sizes = this._getViewSizes();
        var width = this.props.width;
        var height = this.props.height;
        var wrapperStyle = {
            width: width,
            hiehgt: height,
            position: 'relative',
            overflow: 'hidden',
        };
        var mainStyle = {
            width: width + 1,
            height: height + 1,
            position: 'relative',
        };
        var div1Style = {
            position: 'relative',
            width: sizes.width1,
            height: sizes.height1,
            borderColor: '#444',
            borderStyle: this._getBorderStyle(),
            borderWidth: '1px',
        };
        var div2Style = {
            position: 'relative',
            width: sizes.width2,
            height: sizes.height2,
        };
        if (this.isHorizontal()) {
            div1Style['float'] = 'left';
            div2Style['float'] = 'left';
            div1Style['display'] = 'inline-block';
            div2Style['display'] = 'inline-block';
        }
        var div1 = <div style={div1Style} ref="_inner">{this.props.inner}</div>;
        var div2 = <div style={div2Style}>{this.props.outer}</div>;
        var firstDiv;
        var secondDiv;
        if (this.props.orientation == SPLITTER_ORIENTATION.TOP ||
            this.props.orientation == SPLITTER_ORIENTATION.LEFT)
        {
            firstDiv = div1;
            secondDiv = div2;
        } else {
            firstDiv = div2;
            secondDiv = div1;
        }
        return (
            <div style={wrapperStyle}>
                <div style={mainStyle}>
                    {firstDiv}
                    {secondDiv}
                </div>
            </div>
        );
    }
});


var ViewLayout = React.createClass({
    getDefaultProps: function() {
        return {
            initialTopHeight: 100,
            initialLeftWidth: 300,
            initialRightWidth: 300,
            initialBottomHeight: 150,
        };
    },

    getInitialState: function() {
        return {
            topHeight: this.props.initialTopHeight,
            leftWidth: this.props.initialLeftWidth,
            rightWidth: this.props.initialRightWidth,
            bottomHeight: this.props.initialBottomHeight,
        };
    },

    _onResizeTop: function(splitter, innerSize, outerSize) {
        this.setState({
            topHeight: innerSize,
        });
    },

    _onResizeLeft: function(splitter, innerSize, outerSize) {
        this.setState({
            leftWidth: innerSize,
        });
    },

    _onResizeRight: function(splitter, innerSize, outerSize) {
        this.setState({
            rightWidth: innerSize,
        });
    },

    _onResizeBottom: function(splitter, innerSize, outerSize) {
        this.setState({
            bottomHeight: innerSize,
        });
    },

    render: function() {
        greenStyle = {
            backgroundColor: 'green',
            width: '100%',
            height: '100%',
        };
        blueStyle = {
            backgroundColor: 'blue',
            width: '100%',
            height: '100%',
        };
        yellowStyle = {
            backgroundColor: 'yellow',
            width: '100%',
            height: '100%',
        };
        redStyle = {
            backgroundColor: 'red',
            width: '100%',
            height: '100%',
        };
        orangeStyle = {
            backgroundColor: 'orange',
            width: '100%',
            height: '100%',
        };
        cyanStyle = {
            backgroundColor: 'cyan',
            width: '100%',
            height: '100%',
        };

        var topOuterHeight = this.props.height - this.state.topHeight - 1;
        var leftOuterWidth = this.props.width - this.state.leftWidth - 1;
        var rightOuterWidth = leftOuterWidth - this.state.rightWidth - 1;
        var bottomOuterHeight = topOuterHeight - this.state.bottomHeight - 1;

        var topView = this.props.createTopView(this.props.width, this.state.topHeight);
        var leftView = this.props.createLeftView(this.state.leftWidth, topOuterHeight);
        var rightView = this.props.createRightView(this.state.rightWidth, topOuterHeight);
        var bottomView = this.props.createBottomView(rightOuterWidth, this.state.bottomHeight);
        var centerView = this.props.createCenterView(rightOuterWidth, bottomOuterHeight);

        var bottomSplit = <Splitter
            width={rightOuterWidth}
            height={topOuterHeight}
            inner={bottomView}
            outer={centerView}
            initialSplitSize={this.props.initialBottomHeight}
            minInnerSize={50}
            minOuterSize={50}
            orientation={SPLITTER_ORIENTATION.BOTTOM}
            onResize={this._onResizeBottom}
        />;
        var rightSplit = <Splitter
            width={leftOuterWidth}
            height={topOuterHeight}
            inner={rightView}
            outer={bottomSplit}
            minInnerSize={50}
            minOuterSize={50}
            initialSplitSize={this.props.initialRightWidth}
            orientation={SPLITTER_ORIENTATION.RIGHT}
            onResize={this._onResizeRight}
        />;
        var leftSplit = <Splitter
            width={this.props.width}
            height={topOuterHeight}
            inner={leftView}
            outer={rightSplit}
            minInnerSize={50}
            minOuterSize={100}
            initialSplitSize={this.props.initialLeftWidth}
            orientation={SPLITTER_ORIENTATION.LEFT}
            onResize={this._onResizeLeft}
        />;
        var topSplitter = <Splitter
            width={this.props.width}
            height={this.props.height}
            inner={topView}
            outer={leftSplit}
            minInnerSize={50}
            minOuterSize={100}
            initialSplitSize={this.props.initialTopHeight}
            orientation={SPLITTER_ORIENTATION.TOP}
            onResize={this._onResizeTop}
        />;

        return topSplitter;
    }
});


dataSource = [
    {
        type: 'Employees',
        collapsed: false,
        people: [
            {name: 'Paul Gordon', age: 25, sex: 'male', role: 'coder', collapsed: false},
            {name: 'Sarah Lee', age: 23, sex: 'female', role: 'jqueryer', collapsed: false},
        ]
    },
    {
        type: 'CEO',
        collapsed: false,
        people: [
            {name: 'Drew Anderson', age: 35, sex: 'male', role: 'boss', collapsed: false}
        ]
    }
];


var createTopView = function(width, height) {
    return <SizeDisplayer
        width={width}
        height={height}
        style={greenStyle}
        message='Top'
    />;
};

var createLeftView = function(width, height) {
    return <SizeDisplayer
        width={width}
        height={height}
        style={yellowStyle}
        message='Left'
    />;
};

var createRightView = function(width, height) {
    return <SizeDisplayer
        width={width}
        height={height}
        style={redStyle}
        message='Right'
    />;
};

var createBottomView = function(width, height) {
    return <SizeDisplayer
        width={width}
        height={height}
        style={blueStyle}
        message='Bottom'
    />;
};

var createCenterView = function(width, height) {
    return <SizeDisplayer
        width={width}
        height={height}
        style={cyanStyle}
        message='Center'
    />;
};

var FullscreenView = React.createClass({
    getInitialState: function() {
        return {
            windowWidth: window.innerWidth,
            windowHeight: window.innerHeight,
        };
    },

    _handleResize: function(e) {
        this.setState({
            windowWidth: window.innerWidth,
            windowHeight: window.innerHeight,
        });
    },

    componentDidMount: function() {
        window.addEventListener('resize', this._handleResize);
    },

    componentWillUnmount: function() {
        window.removeEventListener('resize', this._handleResize);
    },

    render: function() {
        style = {
            position: 'absolute',
            top: 0,
            bottom: 0,
            left: 0,
            right: 0,
        };
        return (
            <div style={style}>
                <ViewLayout
                    width={this.state.windowWidth}
                    height={this.state.windowHeight}
                    createLeftView={createLeftView}
                    createRightView={createRightView}
                    createTopView={createTopView}
                    createCenterView={createCenterView}
                    createBottomView={createBottomView}
                />
            </div>
        );
    }
});


node = document.getElementById('content')
React.render(
    <FullscreenView />,
    node
);

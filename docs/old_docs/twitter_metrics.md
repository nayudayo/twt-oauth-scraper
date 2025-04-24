# Twitter Analytics Metrics Documentation

## 1. Engagement & Popularity Metrics

### Total Engagement (Line Chart / Bar Chart)
- **Formula**: `retweet_count + reply_count + like_count + quote_count`
- **Purpose**: Measures overall interaction with the tweet

### Engagement Rate (Line Chart / Gauge Chart)
- **Formula**: `(Total Engagement / Impressions) * 100`
- **Purpose**: Measures engagement relative to visibility
- **Note**: Requires impressions data

### Virality Score (Scatter Plot / Heat Map)
- **Formula**: `(retweet_count + quote_count) / (like_count + 1)`
- **Purpose**: Measures how shareable a tweet is compared to passive likes

### Interaction Rate (Donut Chart / Gauge Chart)
- **Formula**: `(reply_count + quote_count) / Total Engagement`
- **Purpose**: Gauges how interactive the engagement is

### Amplification Ratio (Bar Chart / Line Chart)
- **Formula**: `retweet_count / like_count`
- **Purpose**: Indicates how often a like translates into a retweet

### Discussion Ratio (Pie Chart / Donut Chart)
- **Formula**: `reply_count / (retweet_count + like_count + quote_count)`
- **Purpose**: Measures how much of the engagement is conversational

## 2. Quality & Influence Scores

### Engagement-to-Retweet Ratio (Scatter Plot / Bubble Chart)
- **Formula**: `Total Engagement / retweet_count`
- **Purpose**: Lower ratio suggests higher retweet likelihood

### Reply Sentiment Score (Stacked Bar Chart / Heat Map)
- **Type**: Qualitative metric
- **Purpose**: Indicates discussion sentiment (requires sentiment analysis)

### Quote-to-Retweet Ratio (Bar Chart / Line Chart)
- **Formula**: `quote_count / (retweet_count + 1)`
- **Purpose**: Measures amplification with commentary

### Like-to-Reply Ratio (Bar Chart / Scatter Plot)
- **Formula**: `like_count / (reply_count + 1)`
- **Purpose**: High values indicate a more passive audience

### Conversation Depth Score (Tree Map / Hierarchical Chart)
- **Formula**: `reply_count / Total Engagement`
- **Purpose**: Indicates conversation level in interactions

### Shareability Score (Radar Chart / Spider Chart)
- **Formula**: `(retweet_count + quote_count) / Total Engagement`
- **Purpose**: Measures redistribution engagement

## 3. Visibility-Adjusted Engagement Metrics

### Engagement Rate (Area Chart / Line Chart)
- **Formula**: `(Total Engagement / view_count) * 100`
- **Purpose**: Measures interaction rate per view

### Retweet Rate (Bar Chart / Line Chart)
- **Formula**: `(retweet_count / view_count) * 100`
- **Purpose**: Measures retweet likelihood per view

### Reply Rate (Bar Chart / Line Chart)
- **Formula**: `(reply_count / view_count) * 100`
- **Purpose**: Shows discussion rate per view

### Like Rate (Bar Chart / Line Chart)
- **Formula**: `(like_count / view_count) * 100`
- **Purpose**: Shows like percentage per view

### Quote Rate (Bar Chart / Line Chart)
- **Formula**: `(quote_count / view_count) * 100`
- **Purpose**: Shows quote frequency per view

## 4. Virality & Influence Metrics

### Amplification Score (Bubble Chart / Scatter Plot)
- **Formula**: `(retweet_count + quote_count) / view_count`
- **Purpose**: Indicates reshare frequency

### Conversation Score (Heat Map / Area Chart)
- **Formula**: `reply_count / view_count`
- **Purpose**: Measures discussion likelihood

### Engagement Per Thousand Views (EPMV) (Bar Chart / Line Chart)
- **Formula**: `(Total Engagement / view_count) * 1000`
- **Purpose**: Standardized engagement comparison metric

### Shareability Factor (Radar Chart / Spider Chart)
- **Formula**: `(retweet_count + quote_count) / (like_count + 1)`
- **Purpose**: Measures share vs. like ratio

### Conversion Potential (Funnel Chart / Waterfall Chart)
- **Formula**: `Total Engagement / retweet_count`
- **Purpose**: Lower values indicate higher retweet conversion

###############################################################################
###############################################################################

## UI/UX Guidelines for Metric Visualization

### 1. Primary Dashboard Metrics (Most Prominent)
These metrics should be immediately visible and use larger visualizations:

1. Total Engagement (Bar Chart)
   - Highest visual priority
   - Large chart at top of dashboard
   - Shows daily/weekly trends
   - Use clear color hierarchy

2. Engagement Rate (Gauge Chart)
   - Secondary prominence
   - Quick-glance metric
   - Color-coded ranges
   - Prominent placement in top right

3. Virality Score (Heat Map)
   - Medium prominence
   - Color intensity mapping
   - Pattern recognition friendly

### 2. Secondary Metrics (Mid-Level Visibility)
Group these in a grid layout below primary metrics:

1. Interaction Metrics Group:
   - Interaction Rate (Donut Chart)
   - Discussion Ratio (Donut Chart)
   - Amplification Ratio (Bar Chart)
   - Arrange in 3-column grid
   - Consistent size and spacing

2. Rate Metrics Group:
   - Retweet Rate
   - Reply Rate
   - Like Rate
   - Quote Rate
   - Use small multiples pattern
   - Unified scales for comparison

### 3. Detailed Analysis Section (Expandable)
Place these in collapsible panels or separate tabs:

1. Quality Metrics:
   - Reply Sentiment Score
   - Conversation Depth Score
   - Shareability Score
   - Expandable detailed views
   - Rich tooltips for context

2. Advanced Metrics:
   - EPMV
   - Conversion Potential
   - Reserved for power users
   - Detailed documentation available

### UI Organization Principles

1. Visual Hierarchy:
   - Most important metrics: Largest and top placement
   - Secondary metrics: Medium size, grid layout
   - Detailed metrics: Collapsible/tabbed views
   - Consistent color scheme (recommend red theme from current UI)

2. Interaction Design:
   - Hover states for all charts
   - Click to expand for details
   - Consistent tooltip format
   - Time range selectors at top

3. Responsive Layout:
   - Desktop: 3-4 columns
   - Tablet: 2 columns
   - Mobile: Single column
   - Maintain readability at all sizes

4. Performance Considerations:
   - Lazy load secondary metrics
   - Cache frequently accessed data
   - Progressive loading for historical data
   - Optimize chart redraws

### Chart Usage Guidelines

1. Time-Based Data:
   - Use Line/Bar charts
   - Consistent time scales
   - Clear axes labels
   - Zoom capabilities

2. Proportional Data:
   - Use Donut/Pie charts
   - Limited to 5-7 segments
   - Clear legends
   - Percentage labels

3. Comparative Data:
   - Use Bar charts
   - Consistent scales
   - Sort by value
   - Include baselines

4. Complex Relationships:
   - Use Scatter/Bubble charts
   - Clear axes labels
   - Trend lines where applicable
   - Filterable dimensions

### Accessibility Requirements

1. Color Usage:
   - Maintain 4.5:1 contrast ratio
   - Color-blind friendly palette
   - Don't rely solely on color
   - Include patterns/shapes

2. Interactive Elements:
   - Keyboard navigation
   - Screen reader support
   - Focus indicators
   - Clear click targets

3. Text and Labels:
   - Minimum 12px font size
   - High contrast text
   - Clear hierarchy
   - Consistent terminology

### Data Refresh Guidelines

1. Real-Time Metrics:
   - Total Engagement
   - Current Engagement Rate
   - Update every 60 seconds

2. Near-Real-Time:
   - Interaction metrics
   - Rate metrics
   - Update every 5 minutes

3. Aggregated Metrics:
   - Sentiment analysis
   - Complex calculations
   - Update every hour

###############################################################################
###############################################################################
